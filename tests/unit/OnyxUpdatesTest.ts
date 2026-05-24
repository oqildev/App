import type {OnyxKey} from 'react-native-onyx';
import Onyx from 'react-native-onyx';
import {SIDE_EFFECT_REQUEST_COMMANDS, WRITE_COMMANDS} from '@libs/API/types';
import {getMicroSecondOnyxErrorWithTranslationKey} from '@libs/ErrorUtils';
import CONST from '@src/CONST';
import * as OnyxUpdates from '@src/libs/actions/OnyxUpdates';
import DateUtils from '@src/libs/DateUtils';
import * as NumberUtils from '@src/libs/NumberUtils';
import ONYXKEYS from '@src/ONYXKEYS';
import type {OnyxUpdatesFromServer} from '@src/types/onyx';
import getOnyxValue from '../utils/getOnyxValue';
import waitForBatchedUpdates from '../utils/waitForBatchedUpdates';

describe('OnyxUpdatesTest', () => {
    beforeAll(() => {
        Onyx.init({
            keys: ONYXKEYS,
        });
    });

    beforeEach(() => Onyx.clear().then(waitForBatchedUpdates));

    it('applies Airship Onyx updates correctly', () => {
        const reportID = NumberUtils.rand64();
        const reportActionID = NumberUtils.rand64();
        const created = DateUtils.getDBTime();

        const reportValue = {reportID};
        const reportActionValue = {
            [reportActionID]: {
                reportActionID,
                created,
            },
        };

        // Given an onyx update from an Airship push notification
        const airshipUpdates: OnyxUpdatesFromServer<typeof ONYXKEYS.COLLECTION.REPORT | typeof ONYXKEYS.COLLECTION.REPORT_ACTIONS> = {
            type: CONST.ONYX_UPDATE_TYPES.AIRSHIP,
            previousUpdateID: 0,
            lastUpdateID: 1,
            updates: [
                {
                    eventType: '',
                    data: [
                        {
                            onyxMethod: 'merge',
                            key: `${ONYXKEYS.COLLECTION.REPORT}${reportID}`,
                            value: reportValue,
                        },
                        {
                            onyxMethod: 'merge',
                            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`,
                            value: reportActionValue,
                            shouldShowPushNotification: true,
                        },
                    ],
                },
            ],
        };

        // When we apply the updates, then their values are updated correctly
        return OnyxUpdates.apply(airshipUpdates)
            .then(() => getOnyxValues(`${ONYXKEYS.COLLECTION.REPORT}${reportID}`, `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`))
            .then(([report, reportAction]) => {
                expect(report).toStrictEqual(reportValue);
                expect(reportAction).toStrictEqual(reportActionValue);
            });
    });

    it('preserves the response object when HTTPS update is old and request has no successData/failureData/finallyData', async () => {
        // Given the client already has a lastUpdateID applied
        const currentUpdateID = 100;
        await Onyx.merge(ONYXKEYS.ONYX_UPDATES_LAST_UPDATE_ID_APPLIED_TO_CLIENT, currentUpdateID);
        await waitForBatchedUpdates();

        const mockResponse = {
            jsonCode: 200,
            transactionsPending3DSReview: {
                // an ID map key is not a name!
                // eslint-disable-next-line @typescript-eslint/naming-convention
                1234: {amount: 1000, currency: 'USD', created: '2026-02-23', expires: '2026-02-24', lastFourPAN: '1234', merchant: 'TestMerchant', transactionID: '1234'},
            },
            onyxData: [],
        };

        // When we apply an HTTPS update where lastUpdateID is already applied (i.e. "old"),
        // and the request has no successData/failureData/finallyData
        const result = await OnyxUpdates.apply({
            type: CONST.ONYX_UPDATE_TYPES.HTTPS,
            lastUpdateID: currentUpdateID,
            previousUpdateID: currentUpdateID - 1,
            request: {
                command: 'GetTransactionsPending3DSReview',
                data: {},
            },
            response: mockResponse,
        });

        // Then the response should still be returned to the caller, not undefined
        expect(result).toBeDefined();
        expect(result?.jsonCode).toBe(200);
    });

    it('applies full ReconnectApp Onyx updates even if they appear old', async () => {
        // Given the current lastUpdateIDAppliedToClient is merged
        const currentUpdateID = 100;
        await Onyx.merge(ONYXKEYS.ONYX_UPDATES_LAST_UPDATE_ID_APPLIED_TO_CLIENT, currentUpdateID);

        // And we received onyx updates from a full ReconnectApp request with the same lastUpdateID
        const reportID = NumberUtils.rand64();
        const reportValue = {reportID};
        const fullReconnectUpdates: OnyxUpdatesFromServer<typeof ONYXKEYS.COLLECTION.REPORT> = {
            type: CONST.ONYX_UPDATE_TYPES.HTTPS,
            request: {
                command: SIDE_EFFECT_REQUEST_COMMANDS.RECONNECT_APP,
                data: {
                    updateIDFrom: null,
                },
            },
            response: {
                onyxData: [
                    {
                        onyxMethod: 'merge',
                        key: `${ONYXKEYS.COLLECTION.REPORT}${reportID}`,
                        value: reportValue,
                    },
                ],
            },
            previousUpdateID: currentUpdateID - 2,
            lastUpdateID: currentUpdateID - 1,
        };

        // When we apply the updates, then they are still applied even if the lastUpdateID is old
        await OnyxUpdates.apply(fullReconnectUpdates);
        const report = await getOnyxValue(`${ONYXKEYS.COLLECTION.REPORT}${reportID}`);
        expect(report).toStrictEqual(reportValue);
    });

    describe('SUBMIT_REPORT failure passes through UserNotAMember message (issue #91442)', () => {
        const serverMessage = 'Please select another approver or have a workspace admin add user (alice@example.com) to this workspace (Acme).';

        it('replaces the generic error on the optimistic SUBMITTED report action with the server message', async () => {
            const reportID = NumberUtils.rand64();
            const reportActionID = NumberUtils.rand64();

            // Given a SUBMIT_REPORT request whose failureData pre-bakes a generic translated error on the optimistic SUBMITTED action
            const failurePayload: OnyxUpdatesFromServer<typeof ONYXKEYS.COLLECTION.REPORT_ACTIONS> = {
                type: CONST.ONYX_UPDATE_TYPES.HTTPS,
                previousUpdateID: 0,
                lastUpdateID: 1,
                request: {
                    command: WRITE_COMMANDS.SUBMIT_REPORT,
                    data: {reportID, reportActionID},
                    failureData: [
                        {
                            onyxMethod: 'merge',
                            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`,
                            value: {
                                [reportActionID]: {
                                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                                },
                            },
                        },
                    ],
                },
                // And the backend returns a non-200 response with type === 'UserNotAMember' and the actionable message
                response: {
                    jsonCode: 400,
                    type: 'UserNotAMember',
                    message: serverMessage,
                },
            };

            // When the updates are applied
            await OnyxUpdates.apply(failurePayload);
            await waitForBatchedUpdates();

            // Then the report action's errors should contain the server message, not the generic translated string
            const reportActions = (await getOnyxValue(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`)) as Record<string, {errors?: Record<string, string>}>;
            const errors = reportActions?.[reportActionID]?.errors ?? {};
            expect(Object.values(errors)).toEqual([serverMessage]);
        });

        it('replaces the generic error on the report (MERGE_COLLECTION shape from submitMoneyRequestOnSearch)', async () => {
            const reportID = NumberUtils.rand64();

            const failurePayload: OnyxUpdatesFromServer<typeof ONYXKEYS.COLLECTION.REPORT> = {
                type: CONST.ONYX_UPDATE_TYPES.HTTPS,
                previousUpdateID: 0,
                lastUpdateID: 1,
                request: {
                    command: WRITE_COMMANDS.SUBMIT_REPORT,
                    data: {reportID},
                    failureData: [
                        {
                            onyxMethod: 'mergecollection',
                            key: ONYXKEYS.COLLECTION.REPORT,
                            value: {
                                [`${ONYXKEYS.COLLECTION.REPORT}${reportID}`]: {
                                    errors: getMicroSecondOnyxErrorWithTranslationKey('common.genericErrorMessage'),
                                },
                            },
                        },
                    ],
                },
                response: {
                    jsonCode: 400,
                    type: 'UserNotAMember',
                    message: serverMessage,
                },
            };

            await OnyxUpdates.apply(failurePayload);
            await waitForBatchedUpdates();

            const report = (await getOnyxValue(`${ONYXKEYS.COLLECTION.REPORT}${reportID}`)) as {errors?: Record<string, string>};
            const errors = report?.errors ?? {};
            expect(Object.values(errors)).toEqual([serverMessage]);
        });

        it('leaves the generic error in place when response.type is not in the allowlist', async () => {
            const reportID = NumberUtils.rand64();
            const reportActionID = NumberUtils.rand64();
            const prebakedError = getMicroSecondOnyxErrorWithTranslationKey('iou.error.other');

            const failurePayload: OnyxUpdatesFromServer<typeof ONYXKEYS.COLLECTION.REPORT_ACTIONS> = {
                type: CONST.ONYX_UPDATE_TYPES.HTTPS,
                previousUpdateID: 0,
                lastUpdateID: 1,
                request: {
                    command: WRITE_COMMANDS.SUBMIT_REPORT,
                    data: {reportID, reportActionID},
                    failureData: [
                        {
                            onyxMethod: 'merge',
                            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`,
                            value: {
                                [reportActionID]: {errors: prebakedError},
                            },
                        },
                    ],
                },
                response: {
                    jsonCode: 500,
                    type: 'SomeOtherInternalError',
                    message: 'NullPointerException at line 42',
                },
            };

            await OnyxUpdates.apply(failurePayload);
            await waitForBatchedUpdates();

            const reportActions = (await getOnyxValue(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`)) as Record<string, {errors?: Record<string, string>}>;
            // The pre-baked translated error survives; the raw exception text does NOT leak to UI.
            const errors = reportActions?.[reportActionID]?.errors ?? {};
            expect(Object.values(errors)).toEqual(Object.values(prebakedError));
        });
    });
});

function getOnyxValues<TKey extends OnyxKey>(...keys: TKey[]) {
    return Promise.all(keys.map((key) => getOnyxValue(key)));
}
