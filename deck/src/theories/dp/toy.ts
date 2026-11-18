import { m } from "../../data";
import { N_UPDATES, norm, targetDelta, toyUpdates } from "./sim";

/** The toy updates every scene and panel of this theory shares. */
export const TOY_UPDATES = toyUpdates(N_UPDATES, 11);

/** The user taken out by "remove one user": the one with the longest update, the worst case. */
export const removedIndex = TOY_UPDATES.reduce((best, v, i) => (norm(v) > norm(TOY_UPDATES[best]) ? i : best), 0);

/** The real number of users, and the project's delta = 1 / (10 n). */
export const USERS = m("dataset_card", "users");
export const DELTA = targetDelta(USERS);
