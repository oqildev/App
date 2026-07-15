import type {FormOnyxValues} from '@components/Form/types';
import Text from '@components/Text';

import useCurrentUserPersonalDetails from '@hooks/useCurrentUserPersonalDetails';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import useThemeStyles from '@hooks/useThemeStyles';

import {clearDraftValues} from '@libs/actions/FormActions';
import {updateLegalName} from '@libs/actions/PersonalDetails';
import {clearResumeBookTravel} from '@libs/actions/Travel';
import {formatPhoneNumber} from '@libs/LocalePhoneNumber';
import Navigation from '@libs/Navigation/Navigation';

import BaseLegalNamePage, {validateLegalName} from '@pages/settings/Profile/PersonalDetails/BaseLegalNamePage';

import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import INPUT_IDS from '@src/types/form/PersonalDetailsForm';

import React, {useEffect} from 'react';

function TravelLegalNamePage() {
    const {translate} = useLocalize();
    const styles = useThemeStyles();
    const currentUserPersonalDetails = useCurrentUserPersonalDetails();
    const [privatePersonalDetails] = useOnyx(ONYXKEYS.PRIVATE_PERSONAL_DETAILS);
    const [draftValues] = useOnyx(ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM_DRAFT);
    const [resumeBookTravelPolicyID] = useOnyx(ONYXKEYS.RESUME_BOOK_TRAVEL);

    useEffect(() => () => clearDraftValues(ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM), []);

    const handleSubmit = (values: FormOnyxValues<typeof ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM>) => {
        updateLegalName(values.legalFirstName?.trim() ?? '', values.legalLastName?.trim() ?? '', formatPhoneNumber, currentUserPersonalDetails);

        // When this page was opened from the Book Travel flow, re-open the Travel page so BookTravelButton
        // re-mounts and its resume effect can continue the booking flow. Otherwise (e.g. the Travel Invoicing
        // toggle flow) close the RHP as before.
        if (resumeBookTravelPolicyID) {
            Navigation.navigate(ROUTES.TRAVEL_MY_TRIPS.getRoute(resumeBookTravelPolicyID));
            return;
        }
        Navigation.closeRHPFlow();
    };

    const handleBackButtonPress = () => {
        // Abandoning the flow: drop the persisted resume intent so it can't fire later.
        clearResumeBookTravel();
        clearDraftValues(ONYXKEYS.FORMS.PERSONAL_DETAILS_FORM);
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
