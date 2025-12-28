import { StorefrontLanding } from "@/components/storefront/StorefrontLanding";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { getStorefrontPayload } from "@/lib/hub-client";

export default async function StorefrontHomePage() {
  const payload = await getStorefrontPayload();
  return (
    <StorefrontShell payload={payload}>
      <StorefrontLanding payload={payload} />
    </StorefrontShell>
  );
}
