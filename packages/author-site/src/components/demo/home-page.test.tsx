import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { HomePage } from "./home-page";
import {
  convertProjectTemplate,
  createDemo,
  duplicateDemo,
  updateDemo,
  updateProjectTemplate,
  useDemos,
  useProjectTemplates,
} from "@/lib/api";

const mockRouterPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  createDemo: jest.fn(),
  convertProjectTemplate: jest.fn(),
  deleteDemo: jest.fn(),
  deleteProjectTemplate: jest.fn(),
  deleteTemplateCover: jest.fn(),
  duplicateDemo: jest.fn(),
  saveDemoAsTemplate: jest.fn(),
  updateDemo: jest.fn(),
  updateProjectTemplate: jest.fn(),
  uploadTemplateCover: jest.fn(),
  useDemos: jest.fn(),
  useProjectTemplates: jest.fn(),
}));

const mockUseDemos = useDemos as jest.MockedFunction<typeof useDemos>;
const mockUseProjectTemplates = useProjectTemplates as jest.MockedFunction<
  typeof useProjectTemplates
>;
const mockCreateDemo = createDemo as jest.MockedFunction<typeof createDemo>;
const mockConvertProjectTemplate = convertProjectTemplate as jest.MockedFunction<
  typeof convertProjectTemplate
>;
const mockDuplicateDemo = duplicateDemo as jest.MockedFunction<typeof duplicateDemo>;
const mockUpdateDemo = updateDemo as jest.MockedFunction<typeof updateDemo>;
const mockUpdateProjectTemplate = updateProjectTemplate as jest.MockedFunction<
  typeof updateProjectTemplate
>;

const demos = [
  {
    id: "proj-1",
    name: "活动页",
    category: "活动",
    createdAt: 1,
    updatedAt: 2,
    demoPages: [],
  },
];

const templates = [
  {
    id: "tmpl-1",
    sourceProjectId: "proj-1",
    category: "知识库验证",
    name: "验证模板",
    description: "用于验证知识库流程",
    demoCount: 1,
    demoPages: [],
    createdAt: 1,
    updatedAt: 2,
  },
];

describe("HomePage", () => {
  beforeEach(() => {
    mockUseDemos.mockReturnValue({
      demos,
      isLoading: false,
      error: null,
      revalidate: jest.fn(),
    });
    mockUseProjectTemplates.mockReturnValue({
      templates,
      isLoading: false,
      error: null,
      revalidate: jest.fn(),
    });
    mockCreateDemo.mockResolvedValue({
      success: true,
      data: { id: "created", name: "新项目", createdAt: 1, updatedAt: 2 },
    });
    mockDuplicateDemo.mockResolvedValue({
      success: true,
      data: { id: "copied", name: "复制项目", createdAt: 1, updatedAt: 2 },
    });
    mockConvertProjectTemplate.mockResolvedValue({
      success: true,
      data: { id: "converted", name: "验证模板", category: "知识库验证", createdAt: 1, updatedAt: 2 },
    });
    mockUpdateDemo.mockResolvedValue({
      success: true,
      data: { id: "proj-1", name: "更新后", category: "新分类" },
    });
    mockUpdateProjectTemplate.mockResolvedValue({
      success: true,
      data: { ...templates[0], name: "更新后模板", category: "新模板分类" },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("普通项目卡片主体链接到项目编辑页", () => {
    render(<HomePage initialDemos={demos} />);

    expect(screen.getByRole("link", { name: "打开项目 活动页" })).toHaveAttribute(
      "href",
      "/demo/proj-1/edit",
    );
  });

  it("点击空白项目卡片后用名称和分类创建项目", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(screen.getByRole("button", { name: "添加空白项目" }));
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "新活动" },
    });
    expect(screen.getByLabelText("项目分类").tagName).toBe("BUTTON");
    fireEvent.click(screen.getByLabelText("项目分类"));
    fireEvent.click(await screen.findByRole("button", { name: "活动" }));
    fireEvent.click(screen.getByRole("button", { name: "创建项目" }));

    await waitFor(() => {
      expect(mockCreateDemo).toHaveBeenCalledWith("新活动", "活动");
    });
  });

  it("分类字段可以从已有分类下拉列表中选择", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(screen.getByRole("button", { name: "添加空白项目" }));
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "模板同类项目" },
    });
    fireEvent.click(screen.getByLabelText("项目分类"));
    fireEvent.click(await screen.findByRole("button", { name: "知识库验证" }));
    fireEvent.click(screen.getByRole("button", { name: "创建项目" }));

    await waitFor(() => {
      expect(mockCreateDemo).toHaveBeenCalledWith("模板同类项目", "知识库验证");
    });
  });

  it("分类字段点击自定义后才允许输入新分类路径", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(screen.getByRole("button", { name: "添加空白项目" }));
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "资源位弹窗" },
    });
    fireEvent.click(screen.getByLabelText("项目分类"));
    fireEvent.click(await screen.findByRole("button", { name: "自定义分类" }));
    fireEvent.change(screen.getByLabelText("项目分类"), {
      target: { value: "APP资源位 / 弹窗" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建项目" }));

    await waitFor(() => {
      expect(mockCreateDemo).toHaveBeenCalledWith(
        "资源位弹窗",
        "APP资源位/弹窗",
      );
    });
  });

  it("自定义分类路径不能包含空层级", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(screen.getByRole("button", { name: "添加空白项目" }));
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "非法分类项目" },
    });
    fireEvent.click(screen.getByLabelText("项目分类"));
    fireEvent.click(await screen.findByRole("button", { name: "自定义分类" }));
    fireEvent.change(screen.getByLabelText("项目分类"), {
      target: { value: "/弹窗" },
    });

    expect(
      screen.getByText("分类路径不能以 / 开头或结尾，也不能包含连续的 /"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建项目" })).toBeDisabled();
  });

  it("模板更多菜单中使用此模板新建会带上输入的项目分类", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(screen.getByRole("button", { name: /知识库验证/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "打开模板 验证模板 的更多操作" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /使用此模板新建/ }),
    );
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "模板生成项目" },
    });
    fireEvent.click(screen.getByLabelText("项目分类"));
    fireEvent.click(await screen.findByRole("button", { name: "自定义分类" }));
    fireEvent.change(screen.getByLabelText("项目分类"), {
      target: { value: "模板项目" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建项目" }));

    await waitFor(() => {
      expect(mockCreateDemo).toHaveBeenCalledWith(
        "模板生成项目",
        "模板项目",
        "tmpl-1",
      );
    });
  });

  it("模板更多菜单提供名称、分类、封面、转普通项目、删除和新建入口", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(
      screen.getByRole("button", { name: "打开模板 验证模板 的更多操作" }),
    );

    const menuItems = await screen.findAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "使用此模板新建",
      "修改名称",
      "修改分类",
      "修改封面",
      "转为普通项目",
      "删除",
    ]);
    expect(screen.getByRole("menuitem", { name: /修改名称/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /修改分类/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /修改封面/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /转为普通项目/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /使用此模板新建/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^删除$/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /保存为模板/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /复制当前项目/ })).not.toBeInTheDocument();
  });

  it("模板更多菜单支持转为普通项目", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(
      screen.getByRole("button", { name: "打开模板 验证模板 的更多操作" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /转为普通项目/ }),
    );

    await waitFor(() => {
      expect(mockConvertProjectTemplate).toHaveBeenCalledWith("tmpl-1");
    });
  });

  it("模板项目卡片不显示页数", () => {
    render(<HomePage initialDemos={demos} />);

    expect(screen.queryByText("1 页")).not.toBeInTheDocument();
  });

  it("模板更多菜单支持修改名称和分类", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(
      screen.getByRole("button", { name: "打开模板 验证模板 的更多操作" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /修改名称/ }));
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "改名后的模板" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockUpdateProjectTemplate).toHaveBeenCalledWith("tmpl-1", {
        name: "改名后的模板",
      });
    });

    fireEvent.click(
      screen.getByRole("button", { name: "打开模板 验证模板 的更多操作" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /修改分类/ }));
    fireEvent.click(screen.getByLabelText("项目分类"));
    fireEvent.click(await screen.findByRole("button", { name: "自定义分类" }));
    fireEvent.change(screen.getByLabelText("项目分类"), {
      target: { value: "新模板分类" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockUpdateProjectTemplate).toHaveBeenCalledWith("tmpl-1", {
        category: "新模板分类",
      });
    });
  });

  it("普通项目更多菜单提供复制当前项目入口", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(
      screen.getByRole("button", { name: "打开项目 活动页 的更多操作" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /复制当前项目/ }));
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "活动页副本" },
    });
    fireEvent.click(screen.getByRole("button", { name: "复制项目" }));

    await waitFor(() => {
      expect(mockDuplicateDemo).toHaveBeenCalledWith("proj-1", {
        name: "活动页副本",
        category: "活动",
      });
    });
  });

  it("普通项目更多菜单提供修改名称和修改分类入口", async () => {
    render(<HomePage initialDemos={demos} />);

    fireEvent.click(
      screen.getByRole("button", { name: "打开项目 活动页 的更多操作" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /修改名称/ }));
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "改名后的活动页" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockUpdateDemo).toHaveBeenCalledWith("proj-1", {
        name: "改名后的活动页",
      });
    });

    fireEvent.click(
      screen.getByRole("button", { name: "打开项目 活动页 的更多操作" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /修改分类/ }));
    fireEvent.click(screen.getByLabelText("项目分类"));
    fireEvent.click(await screen.findByRole("button", { name: "自定义分类" }));
    fireEvent.change(screen.getByLabelText("项目分类"), {
      target: { value: "新分类" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockUpdateDemo).toHaveBeenCalledWith("proj-1", {
        category: "新分类",
      });
    });
  });

  it("首页父分类包含子分类项目，子分类只展示完整匹配项目", () => {
    mockUseDemos.mockReturnValue({
      demos: [
        {
          id: "proj-parent",
          name: "资源位首页",
          category: "APP资源位",
          createdAt: 1,
          updatedAt: 2,
          demoPages: [],
        },
        {
          id: "proj-child",
          name: "弹窗页",
          category: "APP资源位/弹窗",
          createdAt: 1,
          updatedAt: 2,
          demoPages: [],
        },
      ],
      isLoading: false,
      error: null,
      revalidate: jest.fn(),
    });

    render(<HomePage initialDemos={[]} />);

    const nav = screen.getByRole("navigation", { name: "项目目录" });
    fireEvent.click(within(nav).getByRole("button", { name: /APP资源位\s+2/ }));

    expect(
      screen.getByRole("link", { name: "打开项目 资源位首页" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "打开项目 弹窗页" }),
    ).toBeInTheDocument();
    expect(screen.getByText("APP资源位 / 弹窗")).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: /弹窗\s+1/ }));

    expect(
      screen.queryByRole("link", { name: "打开项目 资源位首页" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "打开项目 弹窗页" }),
    ).toBeInTheDocument();
  });
});
