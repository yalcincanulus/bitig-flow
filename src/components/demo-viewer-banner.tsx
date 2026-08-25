"use client";

import { FlagIcon, TimerIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";

const reportCategories = {
  spam_or_phishing: "Spam or phishing",
  malware_or_suspicious_download: "Malware or suspicious download",
  harmful_or_illegal_content: "Harmful or illegal content",
} as const;

type ReportCategory = keyof typeof reportCategories;

function deletionTime(expiresAt: Date | string) {
  return new Date(expiresAt).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function DemoReportDialog({ slug }: Readonly<{ slug: string }>) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("spam_or_phishing");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/demo/reports/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, ...(details.trim() ? { details: details.trim() } : {}) }),
      });
      if (response.ok || response.status === 409) {
        setMessage("Report received. Thank you.");
      } else if (response.status === 429) {
        setMessage("Report limit reached. Try again later.");
      } else {
        setMessage("This report could not be submitted.");
      }
    } catch {
      setMessage("This report could not be submitted.");
    }
    setPending(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <FlagIcon data-icon="inline-start" />
        Report
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Report temporary content</DialogTitle>
            <DialogDescription>
              Choose a safety category. Do not include contact details or personal information.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor="demo-report-category">Category</FieldLabel>
              <Select
                items={reportCategories}
                value={category}
                onValueChange={(value) => {
                  if (value && value in reportCategories) setCategory(value as ReportCategory);
                }}
                disabled={pending}
              >
                <SelectTrigger id="demo-report-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(reportCategories).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor="demo-report-details">Details (optional)</FieldLabel>
              <Textarea
                id="demo-report-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={280}
                disabled={pending}
              />
              <FieldDescription>{details.length}/280 characters</FieldDescription>
            </Field>
          </FieldGroup>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              Submit report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DemoViewerBanner({
  slug,
  expiresAt,
}: Readonly<{ slug: string; expiresAt: Date | string }>) {
  const iso = new Date(expiresAt).toISOString();
  return (
    <Alert className="mx-auto mb-6 w-full max-w-5xl bg-card">
      <TimerIcon />
      <AlertTitle>Temporary demo content</AlertTitle>
      <AlertDescription>
        Deleted at <time dateTime={iso}>{deletionTime(expiresAt)}</time>. Do not share personal,
        confidential, or unlawful material.
      </AlertDescription>
      <AlertAction>
        <DemoReportDialog slug={slug} />
      </AlertAction>
    </Alert>
  );
}
