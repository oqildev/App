import Onyx from 'react-native-onyx';
import type {PaymentMethod} from '@components/KYCWall/types';
import {payInvoice} from '@libs/actions/IOU/PayMoneyRequest';
import {write} from '@libs/API';
import {WRITE_COMMANDS} from '@libs/API/types';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import {createRandomReport} from '../../utils/collections/reports';
import waitForBatchedUpdates from '../../utils/waitForBatchedUpdates';

jest.mock('@libs/API', () => ({
    write: jest.fn(),
    read: jest.fn(),
    makeRequestWithSideEffects: jest.fn(),
}));

jest.mock('@libs/Sound', () => ({
    __esModule: true,
    default: jest.fn(),
    SOUNDS: {SUCCESS: 'success'},
}));

const CURRENT_USER_ACCOUNT_ID = 1;
const CURRENT_USER_EMAIL = 'payer@test.com';
const INVOICE_OWNER_ACCOUNT_ID = 2;
const BANK_ACCOUNT_ID = 12345;

const chatReport = {
    ...createRandomReport(1, CONST.REPORT.CHAT_TYPE.INVOICE),
    reportID: 'chat1',
    invoiceReceiver: {
        type: CONST.REPORT.INVOICE_RECEIVER_TYPE.INDIVIDUAL,
        accountID: CURRENT_USER_ACCOUNT_ID,
    },
};

const invoiceReport = {
    ...createRandomReport(2, undefined),
    reportID: 'invoice1',
    type: CONST.REPORT.TYPE.INVOICE,
    ownerAccountID: INVOICE_OWNER_ACCOUNT_ID,
    currency: CONST.CURRENCY.USD,
    total: 10000,
};

function callPayInvoice(paymentMethod: PaymentMethod | undefined, payAsBusiness: boolean) {
    payInvoice({
        paymentMethodType: CONST.IOU.PAYMENT_TYPE.EXPENSIFY,
        chatReport,
        invoiceReport,
        introSelected: undefined,
        invoiceReportCurrentNextStepDeprecated: undefined,
        currentUserAccountIDParam: CURRENT_USER_ACCOUNT_ID,
        currentUserEmailParam: CURRENT_USER_EMAIL,
        currentUserLocalCurrency: CONST.CURRENCY.USD,
        payAsBusiness,
        methodID: BANK_ACCOUNT_ID,
        // This is what SettlementButton passes through: the selected method's accountType.
        paymentMethod,
        betas: [CONST.BETAS.PAY_INVOICE_VIA_EXPENSIFY],
        isSelfTourViewed: true,
        // Empty name => payInvoice never tries to create a payer workspace, keeping the test focused on param building.
        defaultWorkspaceName: '',
    });
}

describe('payInvoice - bank account selection (issue #88464)', () => {
    beforeAll(() => {
        Onyx.init({keys: ONYXKEYS});
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await Onyx.clear();
        await Onyx.merge(ONYXKEYS.SESSION, {accountID: CURRENT_USER_ACCOUNT_ID, email: CURRENT_USER_EMAIL});
        await waitForBatchedUpdates();
    });

    it('personal bank account => PayInvoice request includes bankAccountID', async () => {
        callPayInvoice(CONST.PAYMENT_METHODS.PERSONAL_BANK_ACCOUNT, false);
        await waitForBatchedUpdates();

        expect(write).toHaveBeenCalledWith(WRITE_COMMANDS.PAY_INVOICE, expect.objectContaining({bankAccountID: BANK_ACCOUNT_ID}), expect.anything());
    });

    it('business bank account (accountType="businessBankAccount") => PayInvoice request includes bankAccountID', async () => {
        callPayInvoice(CONST.PAYMENT_METHODS.BUSINESS_BANK_ACCOUNT, true);
        await waitForBatchedUpdates();

        // Regression for #88464: the selected business account's methodID must reach the API as bankAccountID,
        // otherwise the PayInvoice request fails with "Unexpected error. Please try again later.".
        expect(write).toHaveBeenCalledWith(WRITE_COMMANDS.PAY_INVOICE, expect.objectContaining({bankAccountID: BANK_ACCOUNT_ID, payAsBusiness: true}), expect.anything());
    });

    it('business bank account with undefined accountType => PayInvoice request includes bankAccountID', async () => {
        callPayInvoice(undefined, true);
        await waitForBatchedUpdates();

        expect(write).toHaveBeenCalledWith(WRITE_COMMANDS.PAY_INVOICE, expect.objectContaining({bankAccountID: BANK_ACCOUNT_ID, payAsBusiness: true}), expect.anything());
    });

    it('debit card => uses fundID, never bankAccountID', async () => {
        callPayInvoice(CONST.PAYMENT_METHODS.DEBIT_CARD, false);
        await waitForBatchedUpdates();

        const payInvoiceCall = jest.mocked(write).mock.calls.find((call) => call[0] === WRITE_COMMANDS.PAY_INVOICE);
        const params = payInvoiceCall?.[1];
        expect(params).toHaveProperty('fundID', BANK_ACCOUNT_ID);
        expect(params).not.toHaveProperty('bankAccountID');
    });
});
