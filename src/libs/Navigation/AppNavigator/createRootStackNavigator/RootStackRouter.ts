import {CommonActions, StackRouter} from '@react-navigation/native';
import type {NavigationState, PartialState, RouterConfigOptions, StackActionType, StackNavigationState} from '@react-navigation/native';
import type {ParamListBase} from '@react-navigation/routers';
import {createGuardContext, evaluateGuards} from '@libs/Navigation/guards';
import getAdaptedStateFromPath from '@libs/Navigation/helpers/getAdaptedStateFromPath';
import {isFullScreenName} from '@libs/Navigation/helpers/isNavigatorName';
import isSideModalNavigator from '@libs/Navigation/helpers/isSideModalNavigator';
import {getTabScreenParam} from '@libs/Navigation/helpers/tabNavigatorUtils';
import {linkingConfig} from '@libs/Navigation/linkingConfig';
import CONST from '@src/CONST';
import NAVIGATORS from '@src/NAVIGATORS';
import SCREENS from '@src/SCREENS';
import {
    handleDismissModalAction,
    handleNavigatingToModalFromModal,
    handleOpenDomainSplitAction,
    handleOpenWorkspaceSplitAction,
    handlePushFullscreenAction,
    handleRemoveFullscreenUnderRHP,
    handleReplaceFullscreenUnderRHP,
    handleReplaceReportsSplitNavigatorAction,
    handleToggleSidePanelWithHistoryAction,
} from './GetStateForActionHandlers';
import syncBrowserHistory from './syncBrowserHistory';
import type {
    DismissModalActionType,
    OpenDomainSplitActionType,
    OpenWorkspaceSplitActionType,
    PreloadActionType,
    PushActionType,
    RemoveFullscreenUnderRHPActionType,
    ReplaceActionType,
    ReplaceFullscreenUnderRHPActionType,
    RootStackNavigatorAction,
    RootStackNavigatorRouterOptions,
    ToggleSidePanelWithHistoryActionType,
} from './types';

function isOpenWorkspaceSplitAction(action: RootStackNavigatorAction): action is OpenWorkspaceSplitActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.OPEN_WORKSPACE_SPLIT;
}

function isOpenDomainSplitAction(action: RootStackNavigatorAction): action is OpenDomainSplitActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.OPEN_DOMAIN_SPLIT;
}

function isPushAction(action: RootStackNavigatorAction): action is PushActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.PUSH;
}

function isReplaceAction(action: RootStackNavigatorAction): action is ReplaceActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.REPLACE;
}

function isDismissModalAction(action: RootStackNavigatorAction): action is DismissModalActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.DISMISS_MODAL;
}

function isReplaceFullscreenUnderRHPAction(action: RootStackNavigatorAction): action is ReplaceFullscreenUnderRHPActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.REPLACE_FULLSCREEN_UNDER_RHP;
}

function isRemoveFullscreenUnderRHPAction(action: RootStackNavigatorAction): action is RemoveFullscreenUnderRHPActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.REMOVE_FULLSCREEN_UNDER_RHP;
}

function isToggleSidePanelWithHistoryAction(action: RootStackNavigatorAction): action is ToggleSidePanelWithHistoryActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.TOGGLE_SIDE_PANEL_WITH_HISTORY;
}

function isPreloadAction(action: RootStackNavigatorAction): action is PreloadActionType {
    return action.type === CONST.NAVIGATION.ACTION_TYPE.PRELOAD;
}

const MODAL_GUARD_REDIRECT_TARGETS = new Set<string>([NAVIGATORS.ONBOARDING_MODAL_NAVIGATOR, NAVIGATORS.MIGRATED_USER_MODAL_NAVIGATOR]);

function isModalGuardRedirectTarget(name: string) {
    return MODAL_GUARD_REDIRECT_TARGETS.has(name);
}

// A route worth preserving under Home when a modal guard redirect overrides the stack.
// Covers fullscreen navigators (REPORTS_SPLIT_NAVIGATOR, SETTINGS_SPLIT_NAVIGATOR, …) plus the
// standalone Concierge screen, which is a valid deep-link target but is not part of FULL_SCREENS_SET.
// Excludes HOME (we always re-add it as the base) and the modal targets themselves.
function isPreservableDeepLinkRoute(name: string) {
    if (name === SCREENS.HOME || isModalGuardRedirectTarget(name)) {
        return false;
    }
    return isFullScreenName(name) || name === SCREENS.CONCIERGE;
}

type PreservationCandidate = {name: string};

// DEBUG (temporary): module-level counter used to cap log output and reveal infinite REDIRECT loops.
let debugLogCount = 0;

function hasRoutesArray(payload: unknown): payload is {routes: PreservationCandidate[]} {
    if (!payload || typeof payload !== 'object') {
        return false;
    }
    const routes = (payload as {routes?: unknown}).routes;
    return Array.isArray(routes);
}

function getActionPayloadRoutes(action: RootStackNavigatorAction): PreservationCandidate[] {
    const payload = (action as {payload?: unknown}).payload;
    return hasRoutesArray(payload) ? payload.routes : [];
}

/**
 * Evaluates navigation guards and handles BLOCK/REDIRECT results
 *
 * @param state - Current navigation state
 * @param action - Navigation action being attempted
 * @param configOptions - Router configuration options
 * @param stackRouter - Stack router instance
 * @returns Modified state if guard blocks/redirects, null if navigation should proceed
 */
function handleNavigationGuards(
    state: StackNavigationState<ParamListBase>,
    action: RootStackNavigatorAction,
    configOptions: RouterConfigOptions,
    stackRouter: ReturnType<typeof StackRouter>,
): ReturnType<ReturnType<typeof StackRouter>['getStateForAction']> | null {
    const guardContext = createGuardContext();
    const guardResult = evaluateGuards(state, action, guardContext);

    if (guardResult.type === 'BLOCK') {
        syncBrowserHistory(state);
        return state;
    }

    if (guardResult.type === 'REDIRECT') {
        const redirectState = getAdaptedStateFromPath(guardResult.route, linkingConfig.config);

        if (!redirectState?.routes) {
            return null;
        }

        // When the redirect adds a modal guard navigator (onboarding / migrated-user), merge the user's
        // existing routes into the fresh redirect state so the deep-link target survives the reset.
        // Two-step process:
        //   1. For each route in redirectState, prefer the richer version from state.routes / action payload
        //      (e.g. user's TabNavigator has the deep-linked report nested in its state).
        //   2. Inject any extra preservable route that the redirect base lacks (e.g. top-level /concierge).
        let resetRoutes: typeof redirectState.routes = redirectState.routes;
        const modalRedirectRoute = redirectState.routes.findLast((route) => isModalGuardRedirectTarget(route.name));

        if (modalRedirectRoute) {
            // Inject ONLY top-level preservable routes (e.g. SCREENS.CONCIERGE) that the redirect base lacks.
            // We deliberately do NOT mutate or replace the TabNavigator base from `redirectState`, because
            // reusing the user's existing TabNavigator brings its nested state with it and the nested
            // children re-dispatch actions that re-enter the guard, producing an infinite REDIRECT loop.
            const actionPayloadRoutes = getActionPayloadRoutes(action);
            const candidateRoutes: PreservationCandidate[] = [...(state.routes as PreservationCandidate[]), ...actionPayloadRoutes];

            const extraRoute = candidateRoutes.find(
                (candidate) => isPreservableDeepLinkRoute(candidate.name) && !redirectState.routes.some((redirectRoute) => redirectRoute.name === candidate.name),
            );
            const modalIndex = redirectState.routes.findIndex((r) => r.name === modalRedirectRoute.name);
            if (extraRoute && modalIndex > 0) {
                const injectedRoutes = [...redirectState.routes];
                // Cast through unknown because `extraRoute` is typed as a minimal name-only object
                // and react-navigation accepts partial route shapes in reset payloads (missing fields get keys generated).
                injectedRoutes.splice(modalIndex, 0, extraRoute as unknown as (typeof injectedRoutes)[0]);
                resetRoutes = injectedRoutes;
            }
        }

        // DEBUG (temporary): cap logs at first 30 calls and number them, so we can spot infinite loops.
        debugLogCount += 1;
        if (debugLogCount <= 30) {
            // eslint-disable-next-line no-console
            console.warn(`[85242 DEBUG #${debugLogCount}] REDIRECT to ${guardResult.route}`, {
                stateIndex: state.index,
                stateFocusedName: state.routes.at(state.index)?.name,
                stateRouteNames: state.routes.map((r) => r.name).join(' > '),
                actionType: action.type,
                actionPayloadRouteNames: getActionPayloadRoutes(action)
                    .map((r) => r.name)
                    .join(' > '),
                redirectRouteNames: redirectState.routes.map((r) => r.name).join(' > '),
                mergedResetRouteNames: resetRoutes.map((r) => r.name).join(' > '),
                extraInjected: resetRoutes !== redirectState.routes,
            });
        }

        const resetIndex = resetRoutes === redirectState.routes ? (redirectState.index ?? redirectState.routes.length - 1) : resetRoutes.length - 1;

        const resetAction = CommonActions.reset({
            index: resetIndex,
            routes: resetRoutes,
        } as PartialState<NavigationState>);

        return stackRouter.getStateForAction(state, resetAction, configOptions);
    }

    return null;
}

function isNavigatingToModalFromModal(state: StackNavigationState<ParamListBase>, action: CommonActions.Action | StackActionType): action is PushActionType {
    if (action.type !== CONST.NAVIGATION.ACTION_TYPE.PUSH) {
        return false;
    }

    const lastRoute = state.routes.at(-1);

    // If the last route is a side modal navigator and the generated minimal action want's to push a new side modal navigator that means they are different ones.
    // We want to dismiss the one that is currently on the top.
    return isSideModalNavigator(lastRoute?.name) && isSideModalNavigator(action.payload.name);
}

function RootStackRouter(options: RootStackNavigatorRouterOptions) {
    const stackRouter = StackRouter(options);

    return {
        ...stackRouter,
        getStateForAction(state: StackNavigationState<ParamListBase>, action: RootStackNavigatorAction, configOptions: RouterConfigOptions) {
            // Evaluate navigation guards FIRST
            const guardState = handleNavigationGuards(state, action, configOptions, stackRouter);
            if (guardState) {
                return guardState;
            }

            // Guards allowed navigation - continue with routing logic

            if (isPreloadAction(action) && action.payload.name === state.routes.at(-1)?.name) {
                return state;
            }

            if (isToggleSidePanelWithHistoryAction(action)) {
                return handleToggleSidePanelWithHistoryAction(state, action);
            }

            if (isOpenWorkspaceSplitAction(action)) {
                return handleOpenWorkspaceSplitAction(state, action, configOptions, stackRouter);
            }

            if (isOpenDomainSplitAction(action)) {
                return handleOpenDomainSplitAction(state, action, configOptions, stackRouter);
            }

            if (isDismissModalAction(action)) {
                return handleDismissModalAction(state, configOptions, stackRouter);
            }

            if (isReplaceFullscreenUnderRHPAction(action)) {
                return handleReplaceFullscreenUnderRHP(state, action, configOptions, stackRouter);
            }

            if (isRemoveFullscreenUnderRHPAction(action)) {
                return handleRemoveFullscreenUnderRHP(state, action, configOptions, stackRouter);
            }

            if (isReplaceAction(action) && (action.payload.name === NAVIGATORS.REPORTS_SPLIT_NAVIGATOR || getTabScreenParam(action.payload) === NAVIGATORS.REPORTS_SPLIT_NAVIGATOR)) {
                return handleReplaceReportsSplitNavigatorAction(state, action, configOptions, stackRouter);
            }

            // When navigating to a specific workspace from WorkspaceListPage there should be entering animation for its sidebar (only case where we want animation for sidebar)
            // That's why we have a separate handler for opening it called handleOpenWorkspaceSplitAction
            // options for WorkspaceSplitNavigator can be found in AuthScreens.tsx > getWorkspaceSplitNavigatorOptions
            if (isPushAction(action) && isFullScreenName(action.payload.name) && action.payload.name !== NAVIGATORS.WORKSPACE_NAVIGATOR) {
                return handlePushFullscreenAction(state, action, configOptions, stackRouter);
            }

            if (isNavigatingToModalFromModal(state, action)) {
                return handleNavigatingToModalFromModal(state, action, configOptions, stackRouter);
            }

            return stackRouter.getStateForAction(state, action, configOptions);
        },
    };
}

export default RootStackRouter;
