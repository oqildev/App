import type {OnyxKey, OnyxUpdate} from 'react-native-onyx';
import ONYXKEYS from '@src/ONYXKEYS';

// The backend's PHP `json_encode` serializes a `skinTones` map with the single key `0` (the darkest tone)
// as a JSON array (`["timestamp"]`) instead of an object (`{"0":"timestamp"}`). When Onyx's `fastMerge`
// applies that array onto an existing object map, the array replaces the map and sibling tones disappear.
// This normalizer converts any array-shaped `skinTones` back to an object map before Onyx receives the
// update, so the merge preserves the user's other variants. See issue #91089.

type SkinTonesMap = Record<string, string>;

function arrayToSkinTonesMap(skinTones: unknown[]): SkinTonesMap {
    const map: SkinTonesMap = {};
    for (let index = 0; index < skinTones.length; index++) {
        const value = skinTones.at(index);
        if (typeof value === 'string') {
            map[String(index)] = value;
        }
    }
    return map;
}

function normalizeReactionsValue(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return;
    }
    const reactions = value as Record<string, {users?: Record<string, {skinTones?: unknown}>}>;
    for (const emojiName of Object.keys(reactions)) {
        const emojiEntry = reactions[emojiName];
        const users = emojiEntry?.users;
        if (!users || typeof users !== 'object') {
            continue;
        }
        for (const accountID of Object.keys(users)) {
            const userEntry = users[accountID];
            if (!userEntry || !Array.isArray(userEntry.skinTones)) {
                continue;
            }
            userEntry.skinTones = arrayToSkinTonesMap(userEntry.skinTones);
        }
    }
}

function isReactionsCollectionKey(key: unknown): key is string {
    return typeof key === 'string' && key.startsWith(ONYXKEYS.COLLECTION.REPORT_ACTIONS_REACTIONS);
}

/**
 * Normalize any array-shaped `users[accountID].skinTones` payloads on `reportActionsReactions_*`
 * updates back into object maps. Mutates the updates in place; safe because these update objects
 * are transient API/Pusher payloads, not shared state.
 */
function normalizeReactionsUpdates<TKey extends OnyxKey>(updates: ReadonlyArray<OnyxUpdate<TKey>> | undefined | null): void {
    if (!updates || !Array.isArray(updates)) {
        return;
    }
    for (const update of updates as ReadonlyArray<{key?: unknown; value?: unknown}>) {
        if (!update || !isReactionsCollectionKey(update.key)) {
            continue;
        }
        normalizeReactionsValue(update.value);
    }
}

export default normalizeReactionsUpdates;
