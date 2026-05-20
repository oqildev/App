import type {StackNavigationState} from '@react-navigation/native';
import type {ParamListBase} from '@react-navigation/routers';
import RootStackRouter from '@libs/Navigation/AppNavigator/createRootStackNavigator/RootStackRouter';
import {evaluateGuards} from '@libs/Navigation/guards';
import getAdaptedStateFromPath from '@libs/Navigation/helpers/getAdaptedStateFromPath';
import NAVIGATORS from '@src/NAVIGATORS';
import SCREENS from '@src/SCREENS';

jest.mock('@libs/Navigation/guards', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    createGuardContext: jest.fn(() => ({
        isAuthenticated: true,
        isLoading: false,
        currentUrl: '',
    })),
    evaluateGuards: jest.fn(() => ({type: 'ALLOW'})),
    registerGuard: jest.fn(),
    clearGuards: jest.fn(),
    getRegisteredGuards: jest.fn(() => []),
}));

jest.mock('@libs/Navigation/helpers/getAdaptedStateFromPath', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    default: jest.fn(),
}));

jest.mock('@libs/Navigation/AppNavigator/createRootStackNavigator/syncBrowserHistory', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    default: jest.fn(),
}));

const mockedEvaluateGuards = evaluateGuards as jest.Mock;
const mockedGetAdaptedStateFromPath = getAdaptedStateFromPath as jest.Mock;

const routeNames = [
    SCREENS.HOME,
    SCREENS.CONCIERGE,
    NAVIGATORS.REPORTS_SPLIT_NAVIGATOR,
    NAVIGATORS.SETTINGS_SPLIT_NAVIGATOR,
    NAVIGATORS.ONBOARDING_MODAL_NAVIGATOR,
    NAVIGATORS.MIGRATED_USER_MODAL_NAVIGATOR,
];

describe('handleNavigationGuards - REDIRECT stack preservation', () => {
    const router = RootStackRouter({});

    const configOptions = {
        routeNames,
        routeParamList: {} as ParamListBase,
        routeGetIdList: {} as Record<string, ((params: Record<string, unknown>) => string) | undefined>,
    };

    const mockAction = {
        type: 'NAVIGATE' as const,
        payload: {name: SCREENS.HOME},
    };

    const onboardingRedirectState = {
        routes: [
            {name: SCREENS.HOME, key: 'home-redirect'},
            {name: NAVIGATORS.ONBOARDING_MODAL_NAVIGATOR, key: 'onboarding-redirect'},
        ],
    };

    const migratedUserRedirectState = {
        routes: [
            {name: SCREENS.HOME, key: 'home-redirect'},
            {name: NAVIGATORS.MIGRATED_USER_MODAL_NAVIGATOR, key: 'migrated-redirect'},
        ],
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockedEvaluateGuards.mockReturnValue({type: 'ALLOW'});
    });

    it('preserves a deep-linked REPORTS_SPLIT_NAVIGATOR under Home when redirecting to onboarding', () => {
        // Given a stack that contains a deep-linked report (a fullscreen navigator)
        const state: StackNavigationState<ParamListBase> = {
            key: 'root',
            index: 0,
            routeNames,
            routes: [{key: 'report-1', name: NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, params: undefined}],
            stale: false,
            type: 'stack',
            preloadedRoutes: [],
        };

        // When the guard redirects to the onboarding modal
        mockedEvaluateGuards.mockReturnValue({type: 'REDIRECT', route: 'onboarding/purpose'});
        mockedGetAdaptedStateFromPath.mockReturnValue(onboardingRedirectState);

        const result = router.getStateForAction(state, mockAction, configOptions);

        // Then the reset stack should be [Home, REPORTS_SPLIT_NAVIGATOR, OnboardingModalNavigator] with the modal focused
        expect(result).not.toBeNull();
        expect(result?.routes).toHaveLength(3);
        expect(result?.routes[0].name).toBe(SCREENS.HOME);
        expect(result?.routes[1].name).toBe(NAVIGATORS.REPORTS_SPLIT_NAVIGATOR);
        expect(result?.routes[2].name).toBe(NAVIGATORS.ONBOARDING_MODAL_NAVIGATOR);
        expect(result?.index).toBe(2);
    });

    it('preserves SCREENS.CONCIERGE under Home when redirecting to onboarding (the regression #90303 case)', () => {
        // Given a stack whose initial route is the standalone Concierge screen (NOT a fullscreen navigator).
        // This is the path that broke in #90303: previously, only fullscreen routes were preserved, so
        // SCREENS.CONCIERGE was dropped, the post-dismiss stack was [Home] of depth 1, and the back button stopped working.
        const state: StackNavigationState<ParamListBase> = {
            key: 'root',
            index: 0,
            routeNames,
            routes: [{key: 'concierge-1', name: SCREENS.CONCIERGE, params: undefined}],
            stale: false,
            type: 'stack',
            preloadedRoutes: [],
        };

        // When the guard redirects to the onboarding modal
        mockedEvaluateGuards.mockReturnValue({type: 'REDIRECT', route: 'onboarding/purpose'});
        mockedGetAdaptedStateFromPath.mockReturnValue(onboardingRedirectState);

        const result = router.getStateForAction(state, mockAction, configOptions);

        // Then the reset stack should layer [Home, Concierge, OnboardingModalNavigator] so that after dismiss
        // the back button still has Home underneath the Concierge screen.
        expect(result).not.toBeNull();
        expect(result?.routes).toHaveLength(3);
        expect(result?.routes[0].name).toBe(SCREENS.HOME);
        expect(result?.routes[1].name).toBe(SCREENS.CONCIERGE);
        expect(result?.routes[2].name).toBe(NAVIGATORS.ONBOARDING_MODAL_NAVIGATOR);
        expect(result?.index).toBe(2);
    });

    it('falls back to the redirect state when no preservable route exists', () => {
        // Given a Home-only stack (a fresh sign-up with no deep link)
        const state: StackNavigationState<ParamListBase> = {
            key: 'root',
            index: 0,
            routeNames,
            routes: [{key: 'home-existing', name: SCREENS.HOME, params: undefined}],
            stale: false,
            type: 'stack',
            preloadedRoutes: [],
        };

        // When the guard redirects to the onboarding modal
        mockedEvaluateGuards.mockReturnValue({type: 'REDIRECT', route: 'onboarding/purpose'});
        mockedGetAdaptedStateFromPath.mockReturnValue(onboardingRedirectState);

        const result = router.getStateForAction(state, mockAction, configOptions);

        // Then the reset stack should be the unmodified [Home, OnboardingModalNavigator]
        expect(result).not.toBeNull();
        expect(result?.routes).toHaveLength(2);
        expect(result?.routes[0].name).toBe(SCREENS.HOME);
        expect(result?.routes[1].name).toBe(NAVIGATORS.ONBOARDING_MODAL_NAVIGATOR);
        expect(result?.index).toBe(1);
    });

    it('does NOT preserve any route for non-modal redirects (e.g. settings)', () => {
        // Given a stack with a deep-linked report
        const state: StackNavigationState<ParamListBase> = {
            key: 'root',
            index: 0,
            routeNames,
            routes: [{key: 'report-1', name: NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, params: undefined}],
            stale: false,
            type: 'stack',
            preloadedRoutes: [],
        };

        // When the guard redirects somewhere that is NOT a modal-guard target (e.g. SettingsSplitNavigator)
        mockedEvaluateGuards.mockReturnValue({type: 'REDIRECT', route: 'settings'});
        mockedGetAdaptedStateFromPath.mockReturnValue({
            routes: [{name: NAVIGATORS.SETTINGS_SPLIT_NAVIGATOR, key: 'settings-redirect'}],
        });

        const result = router.getStateForAction(state, mockAction, configOptions);

        // Then the reset should use the redirect state as-is (no preservation for non-modal redirects)
        expect(result).not.toBeNull();
        expect(result?.routes).toHaveLength(1);
        expect(result?.routes[0].name).toBe(NAVIGATORS.SETTINGS_SPLIT_NAVIGATOR);
    });

    it('preserves a deep-linked fullscreen under Home when redirecting to the migrated-user modal', () => {
        // Given a stack with a deep-linked report
        const state: StackNavigationState<ParamListBase> = {
            key: 'root',
            index: 0,
            routeNames,
            routes: [{key: 'report-1', name: NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, params: undefined}],
            stale: false,
            type: 'stack',
            preloadedRoutes: [],
        };

        // When the guard redirects to the migrated-user welcome modal
        mockedEvaluateGuards.mockReturnValue({type: 'REDIRECT', route: 'migrated-user-welcome'});
        mockedGetAdaptedStateFromPath.mockReturnValue(migratedUserRedirectState);

        const result = router.getStateForAction(state, mockAction, configOptions);

        // Then the same wrap-on-top semantics applies for MIGRATED_USER_MODAL_NAVIGATOR
        expect(result).not.toBeNull();
        expect(result?.routes).toHaveLength(3);
        expect(result?.routes[0].name).toBe(SCREENS.HOME);
        expect(result?.routes[1].name).toBe(NAVIGATORS.REPORTS_SPLIT_NAVIGATOR);
        expect(result?.routes[2].name).toBe(NAVIGATORS.MIGRATED_USER_MODAL_NAVIGATOR);
        expect(result?.index).toBe(2);
    });

    it('uses findLast so an RHP on top of the stack does not hide a deep-linked split navigator beneath', () => {
        // Given a stack where the RIGHT_MODAL_NAVIGATOR (RHP) is on top of a deep-linked split navigator
        const state: StackNavigationState<ParamListBase> = {
            key: 'root',
            index: 1,
            routeNames: [...routeNames, NAVIGATORS.RIGHT_MODAL_NAVIGATOR],
            routes: [
                {key: 'report-1', name: NAVIGATORS.REPORTS_SPLIT_NAVIGATOR, params: undefined},
                {key: 'rhp-1', name: NAVIGATORS.RIGHT_MODAL_NAVIGATOR, params: undefined},
            ],
            stale: false,
            type: 'stack',
            preloadedRoutes: [],
        };

        // When the guard redirects to onboarding
        mockedEvaluateGuards.mockReturnValue({type: 'REDIRECT', route: 'onboarding/purpose'});
        mockedGetAdaptedStateFromPath.mockReturnValue(onboardingRedirectState);

        const result = router.getStateForAction(state, mockAction, configOptions);

        // Then the deep-linked split navigator (NOT the RHP) is the preserved route
        expect(result).not.toBeNull();
        expect(result?.routes).toHaveLength(3);
        expect(result?.routes[0].name).toBe(SCREENS.HOME);
        expect(result?.routes[1].name).toBe(NAVIGATORS.REPORTS_SPLIT_NAVIGATOR);
        expect(result?.routes[2].name).toBe(NAVIGATORS.ONBOARDING_MODAL_NAVIGATOR);
        expect(result?.index).toBe(2);
    });
});
