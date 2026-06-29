import type { AppGraph, AppGraphAction } from "@opencode-workbench/shared";
import type { AppActionPayload } from "@opencode-workbench/demo-ui";

export interface ViewerRuntimePage {
  id: string;
  routeKey?: string;
}

export interface ViewerAppActionResolution {
  action: AppGraphAction;
  targetPageId?: string;
  routeParams: Record<string, unknown>;
  nextState: Record<string, unknown>;
}

export type ViewerAppActionResolutionFailure =
  | "APP_GRAPH_MISSING"
  | "PAGE_ID_MISSING"
  | "FROM_PAGE_MISSING"
  | "FROM_ROUTE_KEY_MISSING"
  | "ACTION_MISSING"
  | "TARGET_MISSING";

export interface ViewerAppActionResolutionError {
  error: ViewerAppActionResolutionFailure;
  routeKey?: string;
  event?: string;
}

export function resolveStateValue(
  expression: string,
  payload: Record<string, unknown>,
  previousState: Record<string, unknown>,
): unknown {
  if (expression.startsWith("$params.")) {
    return payload[expression.slice("$params.".length)];
  }
  if (expression.startsWith("$state.")) {
    return previousState[expression.slice("$state.".length)];
  }
  return expression;
}

export function pickRouteParams(
  action: AppGraphAction,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!action.params?.length) return payload;
  return Object.fromEntries(
    action.params
      .filter((param) => Object.prototype.hasOwnProperty.call(payload, param))
      .map((param) => [param, payload[param]]),
  );
}

export function resolveViewerAppAction(input: {
  appGraph?: AppGraph;
  pages: ViewerRuntimePage[];
  message: AppActionPayload & { pageId?: string };
  previousState: Record<string, unknown>;
}): ViewerAppActionResolution | ViewerAppActionResolutionError {
  const { appGraph, pages, message, previousState } = input;
  if (!appGraph) return { error: "APP_GRAPH_MISSING", event: message.event };
  if (!message.pageId) return { error: "PAGE_ID_MISSING", event: message.event };

  const fromPage = pages.find((page) => page.id === message.pageId);
  if (!fromPage) return { error: "FROM_PAGE_MISSING", event: message.event };
  const fromRouteKey = fromPage.routeKey;
  if (!fromRouteKey) return { error: "FROM_ROUTE_KEY_MISSING", event: message.event };

  const action = appGraph.actions.find(
    (item) => item.from === fromRouteKey && item.event === message.event,
  );
  if (!action) {
    return { error: "ACTION_MISSING", routeKey: fromRouteKey, event: message.event };
  }

  const payload = message.payload ?? {};
  const nextState = action.setState
    ? {
        ...previousState,
        ...Object.fromEntries(
          Object.entries(action.setState).map(([key, expression]) => [
            key,
            resolveStateValue(expression, payload, previousState),
          ]),
        ),
      }
    : previousState;

  const targetRouteKey = action.to ?? action.fallback;
  if (!targetRouteKey) {
    return {
      action,
      nextState,
      routeParams: pickRouteParams(action, payload),
    };
  }

  const targetNode =
    appGraph.pages[targetRouteKey] ??
    (action.fallback ? appGraph.pages[action.fallback] : undefined);
  if (!targetNode) {
    return { error: "TARGET_MISSING", routeKey: targetRouteKey, event: message.event };
  }

  return {
    action,
    targetPageId: targetNode.pageId,
    routeParams: pickRouteParams(action, payload),
    nextState,
  };
}

export function isViewerAppActionResolution(
  value: ViewerAppActionResolution | ViewerAppActionResolutionError,
): value is ViewerAppActionResolution {
  return "action" in value;
}
