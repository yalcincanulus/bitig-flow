import { CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { cn } from "#/lib/utils";

const dateLabel = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Ten years either side of now: far enough for an expiry a User sets ahead and for a window they
// look back over, without a dropdown that scrolls forever.
function decadeAround(reference: Date) {
  return {
    startMonth: new Date(reference.getFullYear() - 10, 0),
    endMonth: new Date(reference.getFullYear() + 10, 11),
  };
}

/**
 * One date, chosen from a Calendar rather than typed into the browser's own control.
 *
 * The native date input renders whatever the browser feels like — a different font, a different
 * chrome, its own popup — inside a Dashboard that otherwise looks like one thing. This is the
 * Calendar the rest of the design system draws, behind a field that matches every other field.
 */
export function DatePicker({
  id,
  value,
  onValueChange,
  placeholder = "Pick a date",
  clearable = false,
  disabled = false,
  className,
}: Readonly<{
  id?: string;
  value: Date | undefined;
  onValueChange: (value: Date | undefined) => void;
  placeholder?: string;
  /** For a date that is allowed to be nothing at all, such as a Link that never expires. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const { startMonth, endMonth } = decadeAround(value ?? new Date());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "justify-between font-normal",
              !value && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        {value ? dateLabel.format(value) : placeholder}
        <CalendarIcon data-icon="inline-end" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value}
          startMonth={startMonth}
          endMonth={endMonth}
          captionLayout="dropdown"
          autoFocus
          onSelect={(next) => {
            onValueChange(next);
            if (next) setOpen(false);
          }}
        />
        {clearable && value ? (
          <div className="border-t border-border p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onValueChange(undefined);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
