import { v7 as uuidv7 } from "uuid";

import { authClient } from "#/lib/auth-client";
import { flushDocumentEditor } from "#/lib/document-editor-lifecycle";
import { organizationSlugFromName } from "#/lib/organization-slug";

export async function createOrganizationFromName(name: string) {
  const baseSlug = organizationSlugFromName(name);
  let lastError = "Could not create organization";

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug.slice(0, 40)}-${uuidv7().slice(0, 8)}`;
    const result = await authClient.organization.create({ name, slug });
    if (!result.error) {
      if (result.data?.id) {
        await flushDocumentEditor();
        await authClient.organization.setActive({ organizationId: result.data.id });
      }
      return { ok: true as const };
    }
    lastError = result.error.message ?? lastError;
  }

  return { ok: false as const, error: lastError };
}
