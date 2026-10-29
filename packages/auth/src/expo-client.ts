import { createAuthClient } from "better-auth/react";
import { organizationClient, usernameClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export function createNativeAuthClient(baseURL: string) {
    return createAuthClient({
        baseURL,
        plugins: [
            usernameClient(),
            organizationClient(),
            expoClient({ scheme: "majimap", storagePrefix: "majimap", storage: SecureStore }),
        ],
    });
}
// For tRPC: send `cookie: authClient.getCookie()` as a header and set credentials: "omit".