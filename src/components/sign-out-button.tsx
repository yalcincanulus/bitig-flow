import { Button } from "#/components/ui/button";
import { useSignOut } from "#/hooks/use-sign-out";

export function SignOutButton() {
  const { pending, signOut } = useSignOut();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => void signOut()}
    >
      Sign out
    </Button>
  );
}
