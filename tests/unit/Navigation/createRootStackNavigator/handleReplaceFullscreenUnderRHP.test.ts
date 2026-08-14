import {
    clearPreInsertedOriginalTabRoute,
    handleRemoveFullscreenUnderRHP,
    handleReplaceFullscreenUnderRHP,
} from '@libs/Navigation/AppNavigator/createRootStackNavigator/GetStateForActionHandlers';
import type {RemoveFullscreenUnderRHPActionType, ReplaceFullscreenUnderRHPActionType} from '@libs/Navigation/AppNavigator/createRootStackNavigator/types';
import type {NavigationPartialRoute, NavigationStateRoute} from '@libs/Navigation/types';

import CONST from '@src/CONST';
import NAVIGATORS from '@src/NAVIGATORS';
import ROUTES from '@src/ROUTES';
import SCREENS from '@src/SCREENS';

import type {CommonActions, NavigationState, ParamListBase, PartialState, Router, RouterConfigOptions, StackActionType, StackNavigationState} from '@react-navigation/native';

import createMock from '../../../utils/createMock';

// Stub the linking parser so the test does not depend on the production linking config.
// Each test sets the parsed state (what getStateFromPath returns for the incoming route).
let mockStubbedParsedState: PartialState<NavigationState> | undefined;
jest.mock('@libs/Navigation/helpers/getStateFromPath', () => ({
    __esModule: true,
    default: jest.fn(() => mockStubbedParsedState),
}));

type TestRoute = NavigationPartialRoute & Pick<NavigationStateRoute, 'key'>;

function makeRoute(name: string, params?: Record<string, unknown>, state?: PartialState<NavigationState>, key?: string): TestRoute {
    return createMock<TestRoute>({key: key ?? `${name}-key`, name, params, state});
}

function makeStackState(routes: TestRoute[]): StackNavigationState<ParamListBase> {
    return {
        key: 'root-stack',
        index: routes.length - 1,
        routeNames: routes.map((r) => r.name),
        routes,
        type: 'stack',
        stale: false,
        preloadedRoutes: [],
    };
}

const CONFIG_OPTIONS: RouterConfigOptions = {
    routeNames: [],
    routeParamList: {},
    routeGetIdList: {},
};

// Identity rehydration: we only assert on the routes/index the handler computed before passing
// them to the router; the router's own rehydration is exercised by other tests.
const stackRouter = createMock<Router<StackNavigationState<ParamListBase>, CommonActions.Action | StackActionType>>({
    getRehydratedState: (partialState) => {
        if (partialState.stale !== false) {
            throw new Error('Expected the test router to receive a rehydrated navigation state.');
        }
        return partialState;
    },
});

/** Builds the state returned by the stubbed getStateFromPath: a TAB_NAVIGATOR focused on WORKSPACE_NAVIGATOR with the given nested routes. */
function makeParsedState(workspaceNavNestedRoutes: PartialState<NavigationState>['routes']): PartialState<NavigationState> {
    return {
        routes: [
            {
                name: NAVIGATORS.TAB_NAVIGATOR,
                state: {
                    index: 0,
                    routes: [
                        {
                            name: NAVIGATORS.WORKSPACE_NAVIGATOR,
                            state: {index: workspaceNavNestedRoutes.length - 1, routes: workspaceNavNestedRoutes},
                        },
                    ],
                },
            },
        ],
    };
}

const INCOMING_SPLIT_ONLY = [{name: NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR, params: {policyID: 'NEW'}}] satisfies PartialState<NavigationState>['routes'];
const INCOMING_WITH_LIST = [{name: SCREENS.WORKSPACES_LIST}, {name: NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR, params: {policyID: 'NEW'}}] satisfies PartialState<NavigationState>['routes'];

function makeRHPRoute(): TestRoute {
    return makeRoute(NAVIGATORS.RIGHT_MODAL_NAVIGATOR, undefined, undefined, 'rhp-key');
}

/**
 * Builds the existing root state: [TAB_NAVIGATOR(WORKSPACE_NAVIGATOR), RHP].
 * Pass `undefined` for workspaceNavNestedRoutes to model a WORKSPACE_NAVIGATOR that was never
 * mounted (no nested state) — e.g. a workspace created from Inbox.
 */
function makeExistingState(workspaceNavNestedRoutes: PartialState<NavigationState>['routes'] | undefined, workspaceNavIndex = 0): StackNavigationState<ParamListBase> {
    const workspaceNavRoute = {
        key: 'workspace-nav-key',
        name: NAVIGATORS.WORKSPACE_NAVIGATOR,
        ...(workspaceNavNestedRoutes ? {state: {index: workspaceNavIndex, routes: workspaceNavNestedRoutes}} : {}),
    };
    const tabNavRoute = makeRoute(NAVIGATORS.TAB_NAVIGATOR, undefined, {index: 0, routes: [workspaceNavRoute]}, 'tab-nav-key');
    return makeStackState([tabNavRoute, makeRHPRoute()]);
}

function makeAction(): ReplaceFullscreenUnderRHPActionType {
    return {
        type: CONST.NAVIGATION.ACTION_TYPE.REPLACE_FULLSCREEN_UNDER_RHP,
        payload: {route: ROUTES.WORKSPACE_INITIAL.getRoute('NEW')},
    };
}

function getWorkspaceNavInnerRoutes(result: StackNavigationState<ParamListBase> | null) {
    const tabRoute = result?.routes.find((r) => r.name === NAVIGATORS.TAB_NAVIGATOR);
    const tabState = tabRoute?.state;
    const workspaceNav = tabState?.routes.find((r) => r.name === NAVIGATORS.WORKSPACE_NAVIGATOR);
    const workspaceNavState = workspaceNav?.state;
    const list = workspaceNavState?.routes?.find((r) => r.name === SCREENS.WORKSPACES_LIST);
    return {
        names: workspaceNavState?.routes?.map((r) => r.name),
        index: workspaceNavState?.index,
        listKey: list?.key,
        listParams: list?.params,
        navigatorKey: workspaceNav?.key,
    };
}

describe('handleReplaceFullscreenUnderRHP — WORKSPACE_NAVIGATOR seeding', () => {
    it('seeds [WORKSPACES_LIST, split] when the workspace tab was never mounted (guards iOS swipe-back regression #93003)', () => {
        mockStubbedParsedState = makeParsedState(INCOMING_SPLIT_ONLY);
        const result = handleReplaceFullscreenUnderRHP(makeExistingState(undefined), makeAction(), CONFIG_OPTIONS, stackRouter);

        expect(result).not.toBeNull();
        const {names, index} = getWorkspaceNavInnerRoutes(result);
        expect(names).toEqual([SCREENS.WORKSPACES_LIST, NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR]);
        expect(index).toBe(1);
        // RHP stays on top of the root stack so its dismiss animation can reveal the new workspace.
        expect(result?.routes.at(-1)?.name).toBe(NAVIGATORS.RIGHT_MODAL_NAVIGATOR);
    });

    it('rebuilds to [WORKSPACES_LIST, split] when the tab only has a stale split underneath (no list)', () => {
        mockStubbedParsedState = makeParsedState(INCOMING_SPLIT_ONLY);
        const existing = makeExistingState([makeRoute(NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR, {policyID: 'OLD'})], 0);
        const result = handleReplaceFullscreenUnderRHP(existing, makeAction(), CONFIG_OPTIONS, stackRouter);

        const {names, index} = getWorkspaceNavInnerRoutes(result);
        expect(names).toEqual([SCREENS.WORKSPACES_LIST, NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR]);
        expect(index).toBe(1);
    });

    it('seeds a fresh (keyless) WORKSPACES_LIST when it is the visible top, so the reveal does not reorder it and flash the list (#90985)', () => {
        mockStubbedParsedState = makeParsedState(INCOMING_SPLIT_ONLY);
        // The user backed into WORKSPACES_LIST: it is the only nested route and the mounted, visible top.
        const existing = makeExistingState([makeRoute(SCREENS.WORKSPACES_LIST, undefined, undefined, 'list-key')], 0);
        const result = handleReplaceFullscreenUnderRHP(existing, makeAction(), CONFIG_OPTIONS, stackRouter);

        const {names, index, listKey} = getWorkspaceNavInnerRoutes(result);
        expect(names).toEqual([SCREENS.WORKSPACES_LIST, NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR]);
        expect(index).toBe(1);
        // The list must NOT reuse the visible top's key, otherwise react-native-screens reorders it top->non-top
        // and flashes it during the reveal. A keyless route is born-non-top and gets a fresh key on rehydration.
        expect(listKey).toBeUndefined();
    });

    it('remounts the WORKSPACE_NAVIGATOR by dropping its key so it mounts the [list, split] cleanly instead of an incremental update that flashes (#90985)', () => {
        mockStubbedParsedState = makeParsedState(INCOMING_SPLIT_ONLY);
        // makeExistingState gives the workspace navigator route the key 'workspace-nav-key'.
        const existing = makeExistingState([makeRoute(SCREENS.WORKSPACES_LIST, undefined, undefined, 'list-key')], 0);
        const result = handleReplaceFullscreenUnderRHP(existing, makeAction(), CONFIG_OPTIONS, stackRouter);

        // The focused tab route is marked for remount by dropping its key; TabRouter.getRehydratedState()
        // then assigns a fresh key, so react-native-screens remounts the navigator instead of doing an
        // incremental update that flashes. The stale key must not survive.
        const {navigatorKey} = getWorkspaceNavInnerRoutes(result);
        expect(navigatorKey).not.toBe('workspace-nav-key');
    });

    it('seeds a fresh WORKSPACES_LIST and reveals the new split when already viewing another workspace', () => {
        mockStubbedParsedState = makeParsedState(INCOMING_SPLIT_ONLY);
        const existing = makeExistingState([makeRoute(SCREENS.WORKSPACES_LIST, undefined, undefined, 'list-key'), makeRoute(NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR, {policyID: 'OLD'})], 1);
        const result = handleReplaceFullscreenUnderRHP(existing, makeAction(), CONFIG_OPTIONS, stackRouter);

        const {names, index, listKey} = getWorkspaceNavInnerRoutes(result);
        expect(names).toEqual([SCREENS.WORKSPACES_LIST, NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR]);
        expect(index).toBe(1);
        // The stale split between the list and the new split is dropped, and the list is reseeded keyless.
        expect(listKey).toBeUndefined();
    });

    it('preserves the existing WORKSPACES_LIST params (e.g. backTo) on the freshly seeded sidebar', () => {
        mockStubbedParsedState = makeParsedState(INCOMING_SPLIT_ONLY);
        const existing = makeExistingState(
            [makeRoute(SCREENS.WORKSPACES_LIST, {backTo: '/settings'}, undefined, 'list-key'), makeRoute(NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR, {policyID: 'OLD'})],
            1,
        );
        const result = handleReplaceFullscreenUnderRHP(existing, makeAction(), CONFIG_OPTIONS, stackRouter);

        const {names, listKey, listParams} = getWorkspaceNavInnerRoutes(result);
        expect(names).toEqual([SCREENS.WORKSPACES_LIST, NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR]);
        // Params survive so the back target is preserved, but the key is dropped to keep the route born-non-top.
        expect(listParams).toEqual({backTo: '/settings'});
        expect(listKey).toBeUndefined();
    });

    it('does not duplicate WORKSPACES_LIST when the incoming parsed state already includes it (idempotent)', () => {
        mockStubbedParsedState = makeParsedState(INCOMING_WITH_LIST);
        const result = handleReplaceFullscreenUnderRHP(makeExistingState(undefined), makeAction(), CONFIG_OPTIONS, stackRouter);

        const {names, index} = getWorkspaceNavInnerRoutes(result);
        expect(names).toEqual([SCREENS.WORKSPACES_LIST, NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR]);
        expect(index).toBe(1);
    });

    it('returns null (no-op) when there is no modal on top of the stack', () => {
        mockStubbedParsedState = makeParsedState(INCOMING_SPLIT_ONLY);
        const tabOnly = makeStackState([makeRoute(NAVIGATORS.TAB_NAVIGATOR, undefined, {index: 0, routes: [{name: NAVIGATORS.WORKSPACE_NAVIGATOR}]}, 'tab-nav-key')]);
        const result = handleReplaceFullscreenUnderRHP(tabOnly, makeAction(), CONFIG_OPTIONS, stackRouter);

        expect(result).toBeNull();
    });
});

/** Builds a report route the way the reports split holds it: SCREENS.REPORT identified by its reportID param. */
function makeReportRoute(reportID: string, key?: string): TestRoute {
    return makeRoute(SCREENS.REPORT, {reportID}, undefined, key ?? `report-${reportID}-key`);
}

/**
 * Builds the state returned by the stubbed getStateFromPath for a report route. The real parser resolves
 * `/r/<reportID>` to the report alone, without the Inbox sidebar and without an index - see the
 * REPORTS_SPLIT_NAVIGATOR entry in linkingConfig, which declares no initialRouteName.
 */
function makeParsedReportState(nestedRoutes: PartialState<NavigationState>['routes']): PartialState<NavigationState> {
    return {
        routes: [
            {
                name: NAVIGATORS.TAB_NAVIGATOR,
                state: {
                    index: 1,
                    routes: [{name: SCREENS.HOME}, {name: NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, state: {routes: nestedRoutes}}],
                },
            },
        ],
    };
}

/** Root state [TAB_NAVIGATOR, RHP] where the tab navigator holds the given tabs and the reports split has `splitRoutes`. */
function makeReportsExistingState(
    splitRoutes: TestRoute[] | undefined,
    splitIndex = (splitRoutes?.length ?? 1) - 1,
    extraTabs: TestRoute[] = [],
    focusedTabIndex = 0,
): StackNavigationState<ParamListBase> {
    const reportsSplitRoute = {
        key: 'reports-split-key',
        name: NAVIGATORS.REPORTS_SPLIT_NAVIGATOR,
        ...(splitRoutes ? {state: {index: splitIndex, routes: splitRoutes}} : {}),
    } as TestRoute;
    const tabNavRoute = makeRoute(NAVIGATORS.TAB_NAVIGATOR, undefined, {index: focusedTabIndex, routes: [reportsSplitRoute, ...extraTabs]}, 'tab-nav-key');
    return makeStackState([tabNavRoute, makeRHPRoute()]);
}

function makeReportAction(reportID: string): ReplaceFullscreenUnderRHPActionType {
    return {
        type: CONST.NAVIGATION.ACTION_TYPE.REPLACE_FULLSCREEN_UNDER_RHP,
        payload: {route: ROUTES.REPORT_WITH_ID.getRoute(reportID)},
    };
}

function getReportsSplitInnerRoutes(result: StackNavigationState<ParamListBase> | null) {
    const tabRoute = result?.routes.find((r) => r.name === NAVIGATORS.TAB_NAVIGATOR);
    const tabState = tabRoute?.state;
    const splitState = tabState?.routes.find((r) => r.name === NAVIGATORS.REPORTS_SPLIT_NAVIGATOR)?.state;
    return {
        names: splitState?.routes?.map((r) => r.name),
        reportIDs: splitState?.routes?.map((r) => (r.params as {reportID?: string} | undefined)?.reportID),
        keys: splitState?.routes?.map((r) => r.key),
        index: splitState?.index,
    };
}

describe('handleReplaceFullscreenUnderRHP - REPORTS_SPLIT_NAVIGATOR history (#98106)', () => {
    afterEach(() => {
        // The handler stores the original tab route in module state for the cancel path; reset it between tests.
        clearPreInsertedOriginalTabRoute();
    });

    it('keeps the report the user is on beneath the pre-inserted destination so back returns to it', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '200'}}]);
        // Viewing the self DM (report 100) when the confirmation step pre-inserts the workspace chat (report 200).
        const existing = makeReportsExistingState([makeRoute(SCREENS.INBOX, undefined, undefined, 'inbox-key'), makeReportRoute('100')]);
        const result = handleReplaceFullscreenUnderRHP(existing, makeReportAction('200'), CONFIG_OPTIONS, stackRouter);

        const {names, reportIDs, index} = getReportsSplitInnerRoutes(result);
        expect(names).toEqual([SCREENS.INBOX, SCREENS.REPORT, SCREENS.REPORT]);
        expect(reportIDs).toEqual([undefined, '100', '200']);
        // The destination stays focused; the self DM sits right beneath it as the back target.
        expect(index).toBe(2);
        expect(result?.routes.at(-1)?.name).toBe(NAVIGATORS.RIGHT_MODAL_NAVIGATOR);
    });

    it('carries the preserved report over keyless so it mounts born-non-top and does not flash (#90985)', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '200'}}]);
        const existing = makeReportsExistingState([makeRoute(SCREENS.INBOX, undefined, undefined, 'inbox-key'), makeReportRoute('100', 'self-dm-key')]);
        const result = handleReplaceFullscreenUnderRHP(existing, makeReportAction('200'), CONFIG_OPTIONS, stackRouter);

        const {keys, reportIDs} = getReportsSplitInnerRoutes(result);
        expect(reportIDs).toEqual([undefined, '100', '200']);
        // The self DM is the mounted, visible top and becomes non-top during the reveal. Reusing its key makes
        // react-native-screens reorder it top->non-top and flash it, so it has to come back keyless.
        expect(keys?.at(1)).toBeUndefined();
        // The sidebar is non-top already, so it keeps its key and its state exactly as it does today.
        expect(keys?.at(0)).toBe('inbox-key');
    });

    it('is idempotent when the same destination is pre-inserted again', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '200'}}]);
        // State after a first pre-insert: the hook can recompute and re-dispatch while the RHP is still open.
        const existing = makeReportsExistingState([makeRoute(SCREENS.INBOX, undefined, undefined, 'inbox-key'), makeReportRoute('100'), makeReportRoute('200')]);
        const result = handleReplaceFullscreenUnderRHP(existing, makeReportAction('200'), CONFIG_OPTIONS, stackRouter);

        const {names, reportIDs, index} = getReportsSplitInnerRoutes(result);
        expect(names).toEqual([SCREENS.INBOX, SCREENS.REPORT, SCREENS.REPORT]);
        expect(reportIDs).toEqual([undefined, '100', '200']);
        expect(index).toBe(2);
    });

    it('does not stack the same report twice when the destination is the report already open', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '100'}}]);
        // The skip-confirmation flows (scan/distance/amount) pre-insert without checking the topmost report.
        const existing = makeReportsExistingState([makeRoute(SCREENS.INBOX, undefined, undefined, 'inbox-key'), makeReportRoute('100')]);
        const result = handleReplaceFullscreenUnderRHP(existing, makeReportAction('100'), CONFIG_OPTIONS, stackRouter);

        const {names, reportIDs, index} = getReportsSplitInnerRoutes(result);
        expect(names).toEqual([SCREENS.INBOX, SCREENS.REPORT]);
        expect(reportIDs).toEqual([undefined, '100']);
        expect(index).toBe(1);
    });

    it('SHAPE A: keeps the open report when the split has no sidebar at all', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '200'}}]);
        // Device-observed shape: the split holds only the report, focused index 0, no Inbox beneath it.
        const existing = makeReportsExistingState([makeReportRoute('100', 'self-dm-key')], 0);
        const result = handleReplaceFullscreenUnderRHP(existing, makeReportAction('200'), CONFIG_OPTIONS, stackRouter);

        const {names, reportIDs, index} = getReportsSplitInnerRoutes(result);
        expect(names).toEqual([SCREENS.REPORT, SCREENS.REPORT]);
        expect(reportIDs).toEqual(['100', '200']);
        expect(index).toBe(1);
    });

    it('drops forward history above the focused report instead of resurrecting it', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '300'}}]);
        // The user opened report 200 and then went back to report 100, so 200 is popped-past forward history.
        const existing = makeReportsExistingState([makeRoute(SCREENS.INBOX, undefined, undefined, 'inbox-key'), makeReportRoute('100'), makeReportRoute('200')], 1);
        const result = handleReplaceFullscreenUnderRHP(existing, makeReportAction('300'), CONFIG_OPTIONS, stackRouter);

        const {reportIDs, index} = getReportsSplitInnerRoutes(result);
        expect(reportIDs).toEqual([undefined, '100', '300']);
        expect(index).toBe(2);
    });

    it('keeps the sidebar-only back target when no report is open (unchanged behavior)', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '200'}}]);
        const existing = makeReportsExistingState([makeRoute(SCREENS.INBOX, undefined, undefined, 'inbox-key')]);
        const result = handleReplaceFullscreenUnderRHP(existing, makeReportAction('200'), CONFIG_OPTIONS, stackRouter);

        const {names, reportIDs, index, keys} = getReportsSplitInnerRoutes(result);
        expect(names).toEqual([SCREENS.INBOX, SCREENS.REPORT]);
        expect(reportIDs).toEqual([undefined, '200']);
        expect(index).toBe(1);
        // The slice degenerates to the sidebar alone, so the stack matches what the single-back-target path
        // produced. The sidebar is carried keyless here because at depth 1 it is itself the visible top that
        // becomes non-top - the same reorder-flash case the preserved report guards against (#90985).
        expect(keys?.at(0)).toBeUndefined();
    });

    it('does not resurrect background history when the reports tab is not the focused tab', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '200'}}]);
        // The user is on the Search tab; the reports tab still holds a report visited earlier in the session.
        const searchTab = makeRoute(NAVIGATORS.SEARCH_FULLSCREEN_NAVIGATOR, undefined, {index: 0, routes: [{name: SCREENS.SEARCH.ROOT}]}, 'search-key');
        const existing = makeReportsExistingState([makeRoute(SCREENS.INBOX, undefined, undefined, 'inbox-key'), makeReportRoute('100')], 1, [searchTab], 1);
        const result = handleReplaceFullscreenUnderRHP(existing, makeReportAction('200'), CONFIG_OPTIONS, stackRouter);

        const {names, reportIDs} = getReportsSplitInnerRoutes(result);
        // Back must land on the Inbox, not on a report the user left before switching tabs.
        expect(names).toEqual([SCREENS.INBOX, SCREENS.REPORT]);
        expect(reportIDs).toEqual([undefined, '200']);
    });

    it('restores the original stack with its keys when the user cancels the flow', () => {
        mockStubbedParsedState = makeParsedReportState([{name: SCREENS.REPORT, params: {reportID: '200'}}]);
        const existing = makeReportsExistingState([makeRoute(SCREENS.INBOX, undefined, undefined, 'inbox-key'), makeReportRoute('100', 'self-dm-key')]);
        const preInserted = handleReplaceFullscreenUnderRHP(existing, makeReportAction('200'), CONFIG_OPTIONS, stackRouter);
        expect(getReportsSplitInnerRoutes(preInserted).reportIDs).toEqual([undefined, '100', '200']);
        if (!preInserted) {
            throw new Error('Expected the pre-insert to return a state.');
        }

        const removeAction: RemoveFullscreenUnderRHPActionType = {
            type: CONST.NAVIGATION.ACTION_TYPE.REMOVE_FULLSCREEN_UNDER_RHP,
            payload: {expectedRouteName: NAVIGATORS.TAB_NAVIGATOR},
        };
        const restored = handleRemoveFullscreenUnderRHP(preInserted, removeAction, CONFIG_OPTIONS, stackRouter);

        // preInsertedOriginalTabRoute is captured before the splice, so the self DM comes back on top with its key.
        const {names, reportIDs, keys, index} = getReportsSplitInnerRoutes(restored);
        expect(names).toEqual([SCREENS.INBOX, SCREENS.REPORT]);
        expect(reportIDs).toEqual([undefined, '100']);
        expect(keys).toEqual(['inbox-key', 'self-dm-key']);
        expect(index).toBe(1);
    });
});

describe('handleReplaceFullscreenUnderRHP - other split navigators keep the single back target', () => {
    afterEach(() => {
        clearPreInsertedOriginalTabRoute();
    });

    it('collapses the settings split to its sidebar even when a screen is open on top of it', () => {
        mockStubbedParsedState = {
            routes: [
                {
                    name: NAVIGATORS.TAB_NAVIGATOR,
                    state: {index: 0, routes: [{name: NAVIGATORS.SETTINGS_SPLIT_NAVIGATOR, state: {routes: [{name: SCREENS.SETTINGS.PREFERENCES.ROOT}]}}]},
                },
            ],
        };
        const settingsSplitRoute = {
            key: 'settings-split-key',
            name: NAVIGATORS.SETTINGS_SPLIT_NAVIGATOR,
            state: {
                index: 1,
                routes: [makeRoute(SCREENS.SETTINGS.ROOT, undefined, undefined, 'settings-root-key'), makeRoute(SCREENS.SETTINGS.PROFILE.ROOT, undefined, undefined, 'profile-key')],
            },
        } as TestRoute;
        const tabNavRoute = makeRoute(NAVIGATORS.TAB_NAVIGATOR, undefined, {index: 0, routes: [settingsSplitRoute]}, 'tab-nav-key');
        const result = handleReplaceFullscreenUnderRHP(makeStackState([tabNavRoute, makeRHPRoute()]), makeAction(), CONFIG_OPTIONS, stackRouter);

        const splitState = result?.routes.find((r) => r.name === NAVIGATORS.TAB_NAVIGATOR)?.state?.routes.find((r) => r.name === NAVIGATORS.SETTINGS_SPLIT_NAVIGATOR)?.state;
        // Only the reports split preserves its stack; every other tab keeps today's single-back-target behavior.
        expect(splitState?.routes?.map((r) => r.name)).toEqual([SCREENS.SETTINGS.ROOT, SCREENS.SETTINGS.PREFERENCES.ROOT]);
        expect(splitState?.index).toBe(1);
    });
});
