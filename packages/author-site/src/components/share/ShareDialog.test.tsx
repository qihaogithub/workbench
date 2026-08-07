import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ShareDialog } from "./ShareDialog";
import { projectApiClient } from "@/lib/project-api";

jest.mock("@/lib/project-api", () => {
  class MockProjectApiError extends Error {}
  return {
    projectApiClient: {
      getPublishStatus: jest.fn(),
      publishProject: jest.fn(),
    },
    ProjectApiError: MockProjectApiError,
  };
});

jest.mock("@/lib/viewer-url", () => ({
  getViewerBaseUrl: jest.fn(() => "http://viewer.test"),
}));

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const publishedStatus = {
  projectId: "proj-1",
  publishedVersion: "v1",
  publishedAt: 123,
  currentVersion: "v1",
  hasUnpublishedChanges: false,
  status: "published",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderDialog() {
  render(<ShareDialog projectId="proj-1" open onOpenChange={jest.fn()} />);
  return userEvent.setup();
}

async function openViewTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "浏览链接" }));
}

describe("ShareDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("已发布项目切换到浏览链接时不会闪现未发布提示", async () => {
    const status = deferred<typeof publishedStatus>();
    (projectApiClient.getPublishStatus as jest.Mock).mockReturnValue(
      status.promise,
    );
    const user = renderDialog();

    await openViewTab(user);

    expect(
      screen.queryByText("项目尚未发布，需要先发布才能获取浏览链接"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("检查发布状态中...")).toBeInTheDocument();

    status.resolve(publishedStatus);

    expect(
      await screen.findByDisplayValue("http://viewer.test/proj-1"),
    ).toBeInTheDocument();
  });

  it("未发布项目显示未发布提示与发布按钮", async () => {
    (projectApiClient.getPublishStatus as jest.Mock).mockResolvedValue({
      ...publishedStatus,
      publishedVersion: null,
      publishedAt: null,
      status: "never_published",
    });
    const user = renderDialog();

    await openViewTab(user);

    expect(
      await screen.findByText("项目尚未发布，需要先发布才能获取浏览链接"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "发布并获取链接" }),
    ).toBeInTheDocument();
  });

  it("点击发布并获取链接后展示浏览链接", async () => {
    (projectApiClient.getPublishStatus as jest.Mock).mockResolvedValue({
      ...publishedStatus,
      publishedVersion: null,
      publishedAt: null,
      status: "never_published",
    });
    (projectApiClient.publishProject as jest.Mock).mockResolvedValue({
      projectId: "proj-1",
      publishedVersion: "v1",
      publishedAt: 456,
      demoCount: 0,
      duration: 1,
    });
    const user = renderDialog();

    await openViewTab(user);
    await screen.findByText("项目尚未发布，需要先发布才能获取浏览链接");

    await user.click(screen.getByRole("button", { name: "发布并获取链接" }));

    expect(
      await screen.findByDisplayValue("http://viewer.test/proj-1"),
    ).toBeInTheDocument();
    expect(projectApiClient.publishProject).toHaveBeenCalledWith("proj-1");
  });
});
