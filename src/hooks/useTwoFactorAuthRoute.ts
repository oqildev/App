import createDynamicRoute from '@libs/Navigation/helpers/dynamicRoutesUtils/createDynamicRoute';
import ONYXKEYS from '@src/ONYXKEYS';
import type {Route} from '@src/ROUTES';
import ROUTES, {DYNAMIC_ROUTES} from '@src/ROUTES';
import useOnyx from './useOnyx';

type TwoFactorAuthRouteResult = {
    getTwoFactorAuthRoute: (backTo?: Route) => Route;
    is2FAEnabled: boolean;
};

/**
 * Returns the 2FA enabled state and a getter that resolves the correct 2FA route based on account state:
 * - setup in progress    → dynamic setup flow (resume), even when 2FA is otherwise marked enabled
 * - 2FA already enabled  → static enabled page
 * - user not validated   → dynamic verify-account page
 * - otherwise            → dynamic setup (copy codes) page
 * @returns An object containing:
 *  - `getTwoFactorAuthRoute`: a function `(backTo?: Route) => Route` that computes the target route.
 *  - `is2FAEnabled`: whether the user already has 2FA enabled.
 */
function useTwoFactorAuthRoute(): TwoFactorAuthRouteResult {
    const [account] = useOnyx(ONYXKEYS.ACCOUNT);

    const is2FAEnabled = !!account?.requiresTwoFactorAuth;

    const getTwoFactorAuthRoute = (backTo?: Route): Route => {
        // A partial-enrollment account can have `requiresTwoFactorAuth` true while guided 2FA setup never finished
        // (e.g. after a domain migration). Routing such a user to the static "2FA enabled" page is wrong: that screen
        // is not in `SET_UP_2FA_SCREENS`, so `RequireTwoFactorAuthenticationOverlay` never dismisses and the CTA looks
        // dead. While setup is still in progress, resume the setup wizard so the focused screen is a 2FA setup screen.
        if (account?.twoFactorAuthSetupInProgress) {
            if (!account?.validated) {
                return createDynamicRoute(DYNAMIC_ROUTES.TWO_FACTOR_AUTH_VERIFY_ACCOUNT.path, backTo);
            }
            return createDynamicRoute(DYNAMIC_ROUTES.TWO_FACTOR_AUTH_ROOT.path, backTo);
        }

        if (is2FAEnabled) {
            return ROUTES.SETTINGS_2FA_ENABLED;
        }

        if (!account?.validated) {
            return createDynamicRoute(DYNAMIC_ROUTES.TWO_FACTOR_AUTH_VERIFY_ACCOUNT.path, backTo);
        }

        return createDynamicRoute(DYNAMIC_ROUTES.TWO_FACTOR_AUTH_ROOT.path, backTo);
    };

    return {getTwoFactorAuthRoute, is2FAEnabled};
}

export default useTwoFactorAuthRoute;
