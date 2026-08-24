import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

/**
 * One subject on a settings surface: a heading column that says what the section is about, and a
 * content column holding the controls that change it.
 *
 * Settings read as a list of subjects rather than a stack of boxes, so a section draws no border of
 * its own — the page separates them with a `Separator` and the two columns do the rest of the work.
 */
function SettingsSection({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      data-slot="settings-section"
      // Narrow screens stack the heading above the controls; from `md` the heading becomes a
      // fixed-width gutter so every section's controls start on the same line.
      className={cn(
        "grid min-w-0 gap-x-8 gap-y-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]",
        className,
      )}
      {...props}
    />
  );
}

function SettingsSectionHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="settings-section-header"
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function SettingsSectionTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      data-slot="settings-section-title"
      className={cn("text-sm font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function SettingsSectionDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="settings-section-description"
      className={cn("text-sm text-balance text-muted-foreground", className)}
      {...props}
    />
  );
}

function SettingsSectionContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="settings-section-content"
      className={cn("flex min-w-0 flex-col items-start gap-4", className)}
      {...props}
    />
  );
}

export {
  SettingsSection,
  SettingsSectionContent,
  SettingsSectionDescription,
  SettingsSectionHeader,
  SettingsSectionTitle,
};
