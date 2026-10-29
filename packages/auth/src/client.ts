import { createAuthClient } from "better-auth/react";
import { organizationClient, usernameClient } from "better-auth/client/plugins";

export function createWebAuthClient(baseURL?: string) {
    return createAuthClient({ baseURL, plugins: [usernameClient(), organizationClient()] });
}
// Sign in with: client.signIn.username({ username: `${name}.${orgSlug}`, password })