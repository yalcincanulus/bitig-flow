import { ChevronsUpDownIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "#/components/ui/sidebar";
import { useSignOut } from "#/hooks/use-sign-out";
import { initials } from "#/lib/initials";

export type UserSummary = Readonly<{
  name: string;
  email: string;
}>;

type UserMenuProps = Readonly<{
  user: UserSummary;
}>;

export function UserMenu({ user }: UserMenuProps) {
  const { pending, signOut } = useSignOut();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          {/* Collapsed to icons the trigger is a bare avatar, so the label carries the identity
              the menu itself shows rather than replacing it with a generic control name. */}
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" aria-label={`User menu for ${user.name}`} />}
          >
            <Avatar size="sm">
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-muted-foreground">{user.email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate font-medium">{user.name}</span>
                <span className="block truncate text-muted-foreground">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuItem disabled={pending} onClick={() => void signOut()}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
