import { useRouter } from "@tanstack/react-router";
import { CheckCircle2Icon, CircleAlertIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "#/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "#/components/ui/input-group";
import { Spinner } from "#/components/ui/spinner";
import {
  deploymentPolicySchema,
  hardDeploymentPolicy,
  initialDeploymentPolicy,
  type DeploymentPolicyValues,
  type RuntimeCapabilities,
  type DeploymentReadinessCheck,
} from "#/lib/deployment-policy";
import { policyChangeConfirmation } from "#/lib/operations";
import { cn } from "#/lib/utils";

type PolicyView = Readonly<{
  policy?: DeploymentPolicyValues;
  lastUpdated?: Readonly<{ at: Date | string; by: string | null }>;
  capability: RuntimeCapabilities;
  readiness: Readonly<{
    checks: ReadonlyArray<DeploymentReadinessCheck>;
    canEnable: Readonly<{ demos: boolean; signUp: boolean }>;
  }>;
  effectiveAvailability: Readonly<{ demos: boolean; signUp: boolean }>;
  impact: Readonly<{ writeLimitedEnvironmentCount: number }>;
}>;

type Feedback = Readonly<{ kind: "success" | "failure"; message: string }>;

type NumberField = Readonly<{
  key: keyof typeof hardDeploymentPolicy;
  label: string;
  description: string;
  divisor?: number;
  unit?: string;
}>;

const MiB = 1024 * 1024;

async function requestPolicyImpact(requested: DeploymentPolicyValues, signal?: AbortSignal) {
  const response = await fetch("/api/operations/policy", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requested),
    signal,
  });
  const result = (await response.json()) as Pick<PolicyView, "impact"> & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Could not preview policy impact");
  return result.impact;
}

const limitGroups: ReadonlyArray<
  Readonly<{ title: string; description: string; fields: ReadonlyArray<NumberField> }>
> = [
  {
    title: "Lifetime and storage",
    description: "How long one demo lives and how many bytes it may hold or serve.",
    fields: [
      {
        key: "environmentLifetimeHours",
        label: "Lifetime",
        description: "Fixed from creation",
        unit: "hours",
      },
      {
        key: "environmentConfirmedBytes",
        label: "Confirmed storage",
        description: "Stored bytes at once",
        divisor: MiB,
        unit: "MiB",
      },
      {
        key: "uploadBytes",
        label: "Per upload",
        description: "Declared and confirmed bytes",
        divisor: MiB,
        unit: "MiB",
      },
      {
        key: "deliveredBytes",
        label: "Delivered bytes",
        description: "Preview, viewer and downloads",
        divisor: MiB,
        unit: "MiB",
      },
    ],
  },
  {
    title: "Content at once",
    description: "What one demo may hold at the same time.",
    fields: [
      { key: "documentCount", label: "Documents", description: "Including samples" },
      {
        key: "uploadedDocumentCount",
        label: "Uploaded documents",
        description: "PDFs and images",
      },
      { key: "vaultCount", label: "Vaults", description: "Including samples" },
      { key: "linkCount", label: "Links", description: "Including samples" },
      { key: "pendingUploadCount", label: "Pending uploads", description: "Concurrent" },
      { key: "confirmationCount", label: "Confirmations", description: "Concurrent" },
    ],
  },
  {
    title: "Lifetime totals",
    description: "Counted over a demo's whole life. Lowering them never gives use back.",
    fields: [
      { key: "uploadKeyLifetimeCount", label: "Upload keys", description: "Issued in total" },
      { key: "visitLifetimeCount", label: "Visits", description: "Recorded in total" },
      { key: "eventLifetimeCount", label: "Events", description: "Recorded in total" },
      {
        key: "documentLifetimeCount",
        label: "Documents created",
        description: "Excluding samples",
      },
      { key: "vaultLifetimeCount", label: "Vaults created", description: "Excluding samples" },
      { key: "linkLifetimeCount", label: "Links created", description: "Excluding samples" },
    ],
  },
];

const globalFields: ReadonlyArray<NumberField> = [
  {
    key: "activeEnvironmentCount",
    label: "Active environments",
    description: "Admission ceiling",
  },
  {
    key: "globalConfirmedBytes",
    label: "Confirmed storage",
    description: "Across every demo",
    divisor: MiB,
    unit: "MiB",
  },
  { key: "globalPendingUploadCount", label: "Pending uploads", description: "Across every demo" },
  { key: "globalConfirmationCount", label: "Confirmations", description: "Across every demo" },
];

const booleanKeys = ["acceptNewDemos", "pauseAllDemoAccess", "signUpEnabled"] as const;

function changedKeys(saved: DeploymentPolicyValues, draft: DeploymentPolicyValues) {
  const numberKeys = Object.keys(hardDeploymentPolicy) as Array<keyof typeof hardDeploymentPolicy>;
  return new Set<string>(
    [...numberKeys, ...booleanKeys].filter((key) => saved[key] !== draft[key]),
  );
}

function PolicyNumberField({
  field,
  value,
  changed,
  onChange,
}: Readonly<{
  field: NumberField;
  value: number;
  changed: boolean;
  onChange: (value: number) => void;
}>) {
  const divisor = field.divisor ?? 1;
  const maximum = hardDeploymentPolicy[field.key] / divisor;
  return (
    <Field>
      <FieldLabel htmlFor={`policy-${field.key}`} className="justify-between">
        {field.label}
        {changed ? <span className="text-[0.625rem] font-normal text-chart-2">Changed</span> : null}
      </FieldLabel>
      <InputGroup className={cn(changed && "border-chart-2/60")}>
        <InputGroupInput
          id={`policy-${field.key}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={maximum}
          step={1}
          value={value / divisor}
          className="tabular-nums"
          onChange={(event) => onChange(Number(event.target.value) * divisor)}
        />
        {field.unit ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{field.unit}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <FieldDescription className="text-[0.6875rem]">
        {field.description} · max {maximum.toLocaleString()}
      </FieldDescription>
    </Field>
  );
}

export function DeploymentPolicyForm({ initialView }: Readonly<{ initialView: PolicyView }>) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [policy, setPolicy] = useState<DeploymentPolicyValues>(
    initialView.policy ?? initialDeploymentPolicy,
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [draftImpact, setDraftImpact] = useState(initialView.impact);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationRequest, setConfirmationRequest] = useState<DeploymentPolicyValues>();
  const [confirmationImpact, setConfirmationImpact] = useState(initialView.impact);

  useEffect(() => {
    const parsed = deploymentPolicySchema.safeParse(policy);
    if (!parsed.success) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void requestPolicyImpact(parsed.data, controller.signal)
        .then(setDraftImpact)
        .catch(() => undefined);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [policy]);

  function setNumber(key: keyof typeof hardDeploymentPolicy, value: number) {
    setPolicy((current) => ({ ...current, [key]: value }));
    setFeedback(undefined);
  }

  async function savePolicy(requested: DeploymentPolicyValues) {
    setPending(true);
    try {
      const response = await fetch("/api/operations/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requested),
      });
      const result = (await response.json()) as PolicyView & { error?: string };
      if (!response.ok) {
        setFeedback({ kind: "failure", message: result.error ?? "Could not save policy." });
      } else {
        setView(result);
        setPolicy(result.policy ?? initialDeploymentPolicy);
        setDraftImpact(result.impact);
        setFeedback({ kind: "success", message: "Deployment policy saved." });
        await router.invalidate({ sync: true });
      }
    } catch {
      setFeedback({ kind: "failure", message: "Could not save Deployment policy." });
    }
    setPending(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const parsed = deploymentPolicySchema.safeParse(policy);
    if (!parsed.success) {
      setFeedback({
        kind: "failure",
        message: parsed.error.issues[0]?.message ?? "Deployment policy is invalid.",
      });
      return;
    }

    const change = policyChangeConfirmation(view.policy ?? initialDeploymentPolicy, parsed.data);
    if (change.required) {
      setPending(true);
      try {
        const impact = await requestPolicyImpact(parsed.data);
        setDraftImpact(impact);
        setConfirmationImpact(impact);
        setConfirmationRequest(parsed.data);
        setConfirmationOpen(true);
      } catch {
        setFeedback({ kind: "failure", message: "Could not preview Deployment policy impact." });
      }
      setPending(false);
      return;
    }
    void savePolicy(parsed.data);
  }

  const confirmationChange = confirmationRequest
    ? policyChangeConfirmation(view.policy ?? initialDeploymentPolicy, confirmationRequest)
    : undefined;

  const savedPolicy = view.policy ?? initialDeploymentPolicy;
  const changed = changedKeys(savedPolicy, policy);
  const blockingChecks = view.readiness.checks.filter((check) => !check.ready);

  return (
    <div className="flex flex-col gap-6">
      {!view.policy ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Deployment policy is missing</AlertTitle>
          <AlertDescription>
            Demo entry and signup are closed. Save the reviewed defaults to restore the record.
          </AlertDescription>
        </Alert>
      ) : null}

      <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>
              Who can get in. Opening access also needs every required runtime check to be ready
              {blockingChecks.length > 0
                ? ` — ${blockingChecks.map((check) => check.label).join(", ")} ${blockingChecks.length === 1 ? "is" : "are"} not.`
                : "."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldSet>
              <FieldLegend className="sr-only">Access settings</FieldLegend>
              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                <AccessOption
                  id="accept-new-demos"
                  label="Accept new demos"
                  description="Existing demos keep running when this is off."
                  checked={policy.acceptNewDemos}
                  changed={changed.has("acceptNewDemos")}
                  effective={
                    view.effectiveAvailability.demos ? "Demo entry open" : "Demo entry closed"
                  }
                  onCheckedChange={(checked) =>
                    setPolicy((current) => ({ ...current, acceptNewDemos: checked }))
                  }
                />
                <AccessOption
                  id="pause-all-demo-access"
                  label="Pause all demo access"
                  description="Nobody can open an existing demo until this is lifted."
                  checked={policy.pauseAllDemoAccess}
                  changed={changed.has("pauseAllDemoAccess")}
                  onCheckedChange={(checked) =>
                    setPolicy((current) => ({ ...current, pauseAllDemoAccess: checked }))
                  }
                />
                <AccessOption
                  id="sign-up-enabled"
                  label="Enable sign-ups"
                  description="Requires healthy mail and password recovery."
                  checked={policy.signUpEnabled}
                  changed={changed.has("signUpEnabled")}
                  effective={view.effectiveAvailability.signUp ? "Signup open" : "Signup closed"}
                  onCheckedChange={(checked) =>
                    setPolicy((current) => ({ ...current, signUpEnabled: checked }))
                  }
                />
              </div>
            </FieldSet>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limits per demo</CardTitle>
            <CardDescription>
              Lower values block new use. They never remove existing data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {limitGroups.map((group) => (
              <FieldSet
                key={group.title}
                className="grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[14rem_minmax(0,1fr)]"
              >
                <div className="flex flex-col gap-1">
                  <FieldLegend className="mb-0 text-xs font-medium">{group.title}</FieldLegend>
                  <p className="text-[0.6875rem] text-muted-foreground">{group.description}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.fields.map((field) => (
                    <PolicyNumberField
                      key={field.key}
                      field={field}
                      value={policy[field.key]}
                      changed={changed.has(field.key)}
                      onChange={(value) => setNumber(field.key, value)}
                    />
                  ))}
                </div>
              </FieldSet>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fleet limits</CardTitle>
            <CardDescription>Ceilings shared by every demo together.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {globalFields.map((field) => (
                <PolicyNumberField
                  key={field.key}
                  field={field}
                  value={policy[field.key]}
                  changed={changed.has(field.key)}
                  onChange={(value) => setNumber(field.key, value)}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {feedback ? (
          <Alert
            variant={feedback.kind === "failure" ? "destructive" : "default"}
            aria-live="polite"
          >
            {feedback.kind === "failure" ? <CircleAlertIcon /> : <CheckCircle2Icon />}
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-popover/95 px-4 py-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur-sm">
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <span className="font-medium">
              {changed.size === 0
                ? "No unsaved changes"
                : `${changed.size} unsaved ${changed.size === 1 ? "change" : "changes"}`}
            </span>
            <span className="text-muted-foreground">
              {draftImpact.writeLimitedEnvironmentCount > 0
                ? `${draftImpact.writeLimitedEnvironmentCount} active ${draftImpact.writeLimitedEnvironmentCount === 1 ? "demo is" : "demos are"} above these limits. `
                : "No active demo is above these limits. "}
              {view.lastUpdated
                ? `Last saved ${new Date(view.lastUpdated.at).toLocaleString()} by ${view.lastUpdated.by ? "the platform operator" : "migration defaults"}.`
                : "No stored policy record."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending || changed.size === 0}
              onClick={() => {
                setPolicy(savedPolicy);
                setFeedback(undefined);
              }}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Reset
            </Button>
            <Button
              type="submit"
              disabled={pending || (changed.size === 0 && Boolean(view.policy))}
            >
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              Save policy
            </Button>
          </div>
        </div>
      </form>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply impactful policy reduction?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmationChange?.reducedFields.length
                ? `${confirmationChange.reducedFields.length} hard-bounded ceilings will be lowered. `
                : ""}
              {confirmationImpact.writeLimitedEnvironmentCount} current demo environments will be
              above the requested limits. Existing data stays available, but users can be blocked
              from adding more.
              {confirmationChange?.pausesAllDemoAccess
                ? " All current demo environment access will also pause."
                : ""}
              {confirmationChange?.closesDemoAdmission ? " New demo admission will close." : ""}
              {confirmationChange?.closesSignUp ? "  Sign-ups will close." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={pending || !confirmationRequest}
              onClick={() => {
                if (!confirmationRequest) return;
                setConfirmationOpen(false);
                void savePolicy(confirmationRequest);
              }}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Apply reduction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AccessOption({
  id,
  label,
  description,
  checked,
  changed,
  effective,
  onCheckedChange,
}: Readonly<{
  id: string;
  label: string;
  description: string;
  checked: boolean;
  changed: boolean;
  effective?: string;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <Field orientation="horizontal" className="px-3 py-3">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <FieldContent>
        <FieldLabel htmlFor={id}>
          {label}
          {changed ? (
            <span className="text-[0.625rem] font-normal text-chart-2">Changed</span>
          ) : null}
        </FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      {effective ? (
        <Badge variant="outline" className="self-start">
          {effective}
        </Badge>
      ) : null}
    </Field>
  );
}
