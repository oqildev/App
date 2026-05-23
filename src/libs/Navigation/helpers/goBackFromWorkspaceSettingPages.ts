import {StackActions} from '@react-navigation/native';
import Navigation, {navigationRef} from '@libs/Navigation/Navigation';
import type {RootNavigatorParamList, State} from '@libs/Navigation/types';
import NAVIGATORS from '@src/NAVIGATORS';
import ROUTES from '@src/ROUTES';
import getActiveTabName from './getActiveTabName';

/**
 * If the previous page is REPORTS_SPLIT_NAVIGATOR we navigate back to it
 * otherwise we go back to WORKSPACES_LIST page.
 */
function goBackFromWorkspaceSettingPages() {
    const rootState = navigationRef.getRootState() as State<RootNavigatorParamList>;
    const lastRoute = rootState.routes.at(-1);
    const secondToLastRoute = rootState.routes.at(-2);

    const isPreviousInbox = getActiveTabName(secondToLastRoute) === NAVIGATORS.REPORTS_SPLIT_NAVIGATOR;

    if (isPreviousInbox) {
        // When the workspace screen was opened via a chat deep-link, the top root route is a
        // cross-tab-pushed TAB_NAVIGATOR — not a modal — so dismissModal is a no-op. Target the
        // root stack key explicitly to pop the pushed TAB_NAVIGATOR and return to the chat.
        if (lastRoute?.name === NAVIGATORS.RIGHT_MODAL_NAVIGATOR) {
            Navigation.dismissModal();
        } else {
            navigationRef.current?.dispatch({...StackActions.pop(), target: rootState.key});
        }
    } else {
        Navigation.goBack(ROUTES.WORKSPACES_LIST.route);
    }
}
export default goBackFromWorkspaceSettingPages;
