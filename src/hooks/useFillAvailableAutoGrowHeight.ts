import variables from '@styles/variables';

import type {LayoutChangeEvent} from 'react-native';

import {useState} from 'react';

type FillAvailableAutoGrowHeight = {
    /** Attach to the wrapper that the input should grow into */
    onLayout: (event: LayoutChangeEvent) => void;

    /** Pass to a TextInput that also sets `autoGrowHeight` */
    maxAutoGrowHeight: number;
};

/**
 * Lets an `autoGrowHeight` TextInput grow into the free space of its panel rather than stopping at the shared
 * `variables.textInputAutoGrowMaxHeight` cap.
 *
 * The wrapper carrying `onLayout` must take its height from its parent (e.g. `styles.flex1`) and must not hold the
 * submit button or any other content sized by itself. A wrapper sized by its own content would feed the measurement
 * back into the layout and oscillate as the input grows.
 */
function useFillAvailableAutoGrowHeight(): FillAvailableAutoGrowHeight {
    const [availableHeight, setAvailableHeight] = useState(0);

    const onLayout = (event: LayoutChangeEvent) => {
        setAvailableHeight(event.nativeEvent.layout.height);
    };

    return {
        onLayout,
        // The height is 0 before the first layout pass, and `autoGrowHeightInputContainer` clamps to a 0 maximum by
        // pinning the input to its minimum height, so keep the shared cap until there is a real measurement.
        maxAutoGrowHeight: availableHeight || variables.textInputAutoGrowMaxHeight,
    };
}

export default useFillAvailableAutoGrowHeight;
