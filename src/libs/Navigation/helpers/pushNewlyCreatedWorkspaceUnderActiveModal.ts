import {CommonActions} from '@react-navigation/native';
import navigationRef from '@libs/Navigation/navigationRef';
import NAVIGATORS from '@src/NAVIGATORS';
import type SCREENS from '@src/SCREENS';

type WorkspaceTargetScreen = typeof SCREENS.WORKSPACE.PROFILE | typeof SCREENS.WORKSPACE.INITIAL;

/**
 * Pushes a freshly created workspace's split navigator into TAB_NAVIGATOR / WORKSPACE_NAVIGATOR
 * while an RHP is still on top of the root stack. The dispatch is targeted at the TAB_NAVIGATOR's
 * state key, so the RHP stays in place; once the caller dismisses it, the modal animation reveals
 * the new workspace page directly instead of briefly exposing WORKSPACES_LIST underneath.
 *
 * The initial WORKSPACES_LIST seed is kept (default behavior) so the pre-mounted state matches
 * what `getAdaptedStateFromPath` produces when the same workspace URL is later re-parsed by
 * `revealRouteBeforeDismissingModal`. If we omitted the seed (`initial: false`), the sidebar-prepend
 * branch in `handleReplaceFullscreenUnderRHP` would see different first routes between existing
 * and new state and prepend the pre-mounted split navigator, producing a corrupted 3-deep stack
 * (`[WORKSPACE_SPLIT_NAVIGATOR, WORKSPACES_LIST, WORKSPACE_SPLIT_NAVIGATOR]`).
 */
function pushNewlyCreatedWorkspaceUnderActiveModal(targetScreen: WorkspaceTargetScreen, policyID: string) {
    const rootState = navigationRef.getRootState();
    const tabRoute = rootState?.routes.findLast((r) => r.name === NAVIGATORS.TAB_NAVIGATOR);
    const tabStateKey = tabRoute?.state?.key;
    if (!tabStateKey) {
        return;
    }

    navigationRef.dispatch({
        ...CommonActions.navigate({
            name: NAVIGATORS.WORKSPACE_NAVIGATOR,
            params: {
                screen: NAVIGATORS.WORKSPACE_SPLIT_NAVIGATOR,
                params: {
                    screen: targetScreen,
                    params: {policyID},
                },
            },
        }),
        target: tabStateKey,
    });
}

export default pushNewlyCreatedWorkspaceUnderActiveModal;
