import type {FormOnyxValues} from '@components/Form/types';
import Text from '@components/Text';

import useCurrentUserPersonalDetails from '@hooks/useCurrentUserPersonalDetails';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import useThemeStyles from '@hooks/useThemeStyles';

import {clearDraftValues} from '@libs/actions/FormActions';
import {updateLegalName} from '@libs/actions/PersonalDetails';
import {formatPhoneNumber} from '@libs/LocalePhoneNumber';
import Navigation from '@libs/Navigation/Navigation';

import BaseLegalNamePage, {validateLegalName} from '@pages/settings/Profile/PersonalDetails/BaseLegalNamePage';

import ONYXKEYS from '@src/ONYXKEYS';
import SCREENS from '@src/SCREENS';
import INPUT_IDS from '@src/types/form/PersonalDetailsForm';

import {useRoute} from '@react-navigation/native';
import React, {useEffect} from 'react';

function TravelLegalNamePage() {
    const {translate} = useLocalize();
    const styles = useThemeStyles();
    const currentUserPersonalDetails = useCurrentUserPersonalDetails();
    const [privatePersonalDetails] = useOnyx(ONYXKEYS.PRIVATE_PERSONAL_DETAILS);
    const [draftValues] = useOnyx(ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM_DRAFT);

    // This page is reached from two flows: the Book Travel flow (Travel modal stack, this screen) and the
    // Travel Invoicing toggle flow (Workspace modal stack). In the Book Travel flow the Book Travel page is
    // still mounted underneath in the same navigator, so we just go back one step and let its resume effect
    // continue; in the toggle flow we close the whole RHP as before.
    const route = useRoute();
    const isBookTravelFlow = route.name === SCREENS.TRAVEL.MISSING_PERSONAL_DETAILS;

    useEffect(() => () => clearDraftValues(ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM), []);

    const handleSubmit = (values: FormOnyxValues<typeof ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM>) => {
        // updateLegalName already navigates back one step; in the Book Travel flow that reveals the still-mounted
        // Book Travel page whose resume effect advances the flow, so we must NOT tear down the whole RHP here.
        updateLegalName(values.legalFirstName?.trim() ?? '', values.legalLastName?.trim() ?? '', formatPhoneNumber, currentUserPersonalDetails);
        if (!isBookTravelFlow) {
            Navigation.closeRHPFlow();
        }
    };

    const handleBackButtonPress = () => {
        clearDraftValues(ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM);
        if (isBookTravelFlow) {
            Navigation.goBack();
            return;
        }
        Navigation.closeRHPFlow();
    };

    return (
        <BaseLegalNamePage
            formID={ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM}
            submitButtonText={translate('common.next')}
            onBackButtonPress={handleBackButtonPress}
            onSubmit={handleSubmit}
            validate={validateLegalName}
            headerTitle={translate('travel.bookTravel')}
            shouldSaveDraft
            defaultFirstName={draftValues?.[INPUT_IDS.LEGAL_FIRST_NAME] ?? privatePersonalDetails?.[INPUT_IDS.LEGAL_FIRST_NAME]}
            defaultLastName={draftValues?.[INPUT_IDS.LEGAL_LAST_NAME] ?? privatePersonalDetails?.[INPUT_IDS.LEGAL_LAST_NAME]}
        >
            <Text style={[styles.textHeadlineLineHeightXXL, styles.mb3]}>{translate('privatePersonalDetails.enterLegalName')}</Text>
            <Text style={[styles.textSupporting, styles.mb6]}>{translate('workspace.moreFeatures.travel.personalDetailsDescription')}</Text>
        </BaseLegalNamePage>
    );
}

export default TravelLegalNamePage;
