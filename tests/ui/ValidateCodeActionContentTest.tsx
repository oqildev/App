import {render} from '@testing-library/react-native';

import ValidateCodeActionContent from '@components/ValidateCodeActionModal/ValidateCodeActionContent';

import ONYXKEYS from '@src/ONYXKEYS';
import type {ValidateCodeReason} from '@src/types/onyx/VerifyValidateCodeAction';

import type ReactNative from 'react-native';

import {CONST as COMMON_CONST} from 'expensify-common';
import React from 'react';
import Onyx from 'react-native-onyx';

import waitForBatchedUpdates from '../utils/waitForBatchedUpdates';

jest.mock('@libs/Navigation/Navigation', () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    getActiveRoute: jest.fn(() => ''),
    getActiveRouteWithoutParams: jest.fn(() => ''),
    isNavigationReady: jest.fn(() => Promise.resolve()),
}));

// The magic-code form renders copy through RenderHTML, which needs a real layout to build its tree
jest.mock('@components/RenderHTML', () => {
    const ReactMock = jest.requireActual<typeof React>('react');
    const {Text} = jest.requireActual<typeof ReactNative>('react-native');

    return ({html}: {html: string}) => ReactMock.createElement(Text, null, html.replaceAll(/<[^>]*>/g, ''));
});

const ADD_CONTACT_METHOD = COMMON_CONST.VALIDATE_CODE_REASONS.ADD_CONTACT_METHOD;
const VALIDATE_ACCOUNT = COMMON_CONST.VALIDATE_CODE_REASONS.VALIDATE_ACCOUNT;

describe('ValidateCodeActionContent', () => {
    beforeAll(() => {
        Onyx.init({keys: ONYXKEYS});
    });

    beforeEach(() => {
        return Onyx.clear().then(waitForBatchedUpdates);
    });

    /** Seeds the account-level record a code request leaves behind, as `requestValidateCodeAction` writes it */
    async function givenACodeWasJustRequestedFor(reason: ValidateCodeReason) {
        await Onyx.merge(ONYXKEYS.VALIDATE_ACTION_CODE, {
            lastValidateCodeRequestedAt: Date.now(),
            lastValidateCodeReason: reason,
        });
        await waitForBatchedUpdates();
    }

    async function renderContent(validateCodeReasonCode?: ValidateCodeReason) {
        const sendValidateCode = jest.fn();
        render(
            <ValidateCodeActionContent
                title="Make sure it's you"
                descriptionPrimary="Enter the magic code"
                validateCodeActionErrorField="addedLogin"
                handleSubmitForm={jest.fn()}
                clearError={jest.fn()}
                sendValidateCode={sendValidateCode}
                validateCodeReasonCode={validateCodeReasonCode}
            />,
        );
        await waitForBatchedUpdates();
        return sendValidateCode;
    }

    it('requests its own code when the recent one was sent for a different flow', async () => {
        // Given a code that was just sent to verify the account
        await givenACodeWasJustRequestedFor(VALIDATE_ACCOUNT);

        // When the add-contact-method step mounts right after, still inside the 30s resend window
        const sendValidateCode = await renderContent(ADD_CONTACT_METHOD);

        // Then it sends anyway: the account-verification code does not cover adding a contact method,
        // so treating it as "already sent" is what left the user waiting for an email that never came
        expect(sendValidateCode).toHaveBeenCalledTimes(1);
    });

    it('does not resend when the recent code was sent for this same flow', async () => {
        // Given this screen already requested its own code moments ago
        await givenACodeWasJustRequestedFor(ADD_CONTACT_METHOD);

        // When it mounts again within the resend window (e.g. a page reload)
        const sendValidateCode = await renderContent(ADD_CONTACT_METHOD);

        // Then the reload de-duplication still holds and no second email goes out
        expect(sendValidateCode).not.toHaveBeenCalled();
    });

    it('requests a code when nothing was sent recently', async () => {
        // Given no code has been requested at all
        // When the screen mounts
        const sendValidateCode = await renderContent(ADD_CONTACT_METHOD);

        // Then it sends, as before
        expect(sendValidateCode).toHaveBeenCalledTimes(1);
    });

    it('keeps suppressing after any recent code for screens that declare no flow', async () => {
        // Given a code was just sent for some other flow
        await givenACodeWasJustRequestedFor(VALIDATE_ACCOUNT);

        // When a screen that has not opted in mounts
        const sendValidateCode = await renderContent();

        // Then behaviour is unchanged for the screens this change does not touch
        expect(sendValidateCode).not.toHaveBeenCalled();
    });
});
