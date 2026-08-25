import { useRouter } from "@tanstack/react-router";
import { CheckCircle2Icon, CircleAlertIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { DeploymentReadinessList } from "#/components/deployment-readiness-list";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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

const environmentFields: ReadonlyArray<NumberField> = [
  {
    key: "environmentLifetimeHours",
    label: "Lifetime",
    description: "Fixed from creation",
    unit: "hours",
  },
  {
    key: "environmentConfirmedBytes",
    label: "Confirmed storage",
    description: "Current stored bytes",
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
  { key: "documentCount", label: "Documents", description: "Simultaneous total" },
  {
    key: "uploadedDocumentCount",
    label: "Uploaded documents",
    description: "Simultaneous PDF and image total",
  },
  { key: "vaultCount", label: "Vaults", description: "Simultaneous total" },
  { key: "linkCount", label: "Links", description: "Simultaneous total" },
  {
    key: "pendingUploadCount",
    label: "Pending uploads",
    description: "Concurrent per environment",
  },
  { key: "confirmationCount", label: "Confirmations", description: "Concurrent per environment" },
  { key: "uploadKeyLifetimeCount", label: "Upload keys", description: "Lifetime total" },
  {
    key: "deliveredBytes",
    label: "Delivered bytes",
    description: "Preview, Viewer, and downloads",
    divisor: MiB,
    unit: "MiB",
  },
  { key: "visitLifetimeCount", label: "Visits", description: "Lifetime total" },
  { key: "eventLifetimeCount", label: "Events", description: "Lifetime total" },
  {
    key: "documentLifetimeCount",
    label: "Documents created",
    description: "Lifetime total, excluding Samples",
  },
  {
    key: "vaultLifetimeCount",
    label: "Vaults created",
    description: "Lifetime total, excluding Samples",
  },
  {
    key: "linkLifetimeCount",
    label: "Links created",
    description: "Lifetime total, excluding Samples",
  },
];

const globalFields: ReadonlyArray<NumberField> = [
  {
    key: "activeEnvironmentCount",
    label: "Active environments",
    description: "Fleet admission ceiling",
  },
  {
    key: "globalConfirmedBytes",
    label: "Confirmed storage",
    description: "Across the fleet",
    divisor: MiB,
    unit: "MiB",
  },
  { key: "globalPendingUploadCount", label: "Pending uploads", description: "Across the fleet" },
  { key: "globalConfirmationCount", label: "Confirmations", description: "Across the fleet" },
];

function PolicyNumberField({
  field,
  value,
  onChange,
}: Readonly<{
  field: NumberField;
  value: number;
  onChange: (value: number) => void;
}>) {
  const divisor = field.divisor ?? 1;
  const maximum = hardDeploymentPolicy[field.key] / divisor;
  return (
    <Field>
      <FieldLabel htmlFor={`policy-${field.key}`}>{field.label}</FieldLabel>
      <Input
        id={`policy-${field.key}`}
        type="number"
        min={1}
        max={maximum}
        step={1}
        value={value / divisor}
        onChange={(event) => onChange(Number(event.target.value) * divisor)}
      />
      <FieldDescription>
        {field.description}. Maximum {maximum.toLocaleString()}
        {field.unit ? ` ${field.unit}` : ""}.
      </FieldDescription>
    </Field>
  );
}

function CapabilityCard({ view }: Readonly<{ view: PolicyView }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operator readiness checklist</CardTitle>
        <CardDescription>
          Every required check must be ready before Demo entry or signup can be enabled.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DeploymentReadinessList checks={view.readiness.checks} />
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        <Badge variant={view.effectiveAvailability.demos ? "default" : "outline"}>
          Demo entry: {view.effectiveAvailability.demos ? "Available" : "Closed"}
        </Badge>
        <Badge variant={view.effectiveAvailability.signUp ? "default" : "outline"}>
          Signup: {view.effectiveAvailability.signUp ? "Available" : "Closed"}
        </Badge>
      </CardFooter>
    </Card>
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
        setFeedback({ kind: "success", message: "Deployment Policy saved." });
        await router.invalidate({ sync: true });
      }
    } catch {
      setFeedback({ kind: "failure", message: "Could not save Deployment Policy." });
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
        message: parsed.error.issues[0]?.message ?? "Deployment Policy is invalid.",
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
        setFeedback({ kind: "failure", message: "Could not preview Deployment Policy impact." });
      }
      setPending(false);
      return;
    }
    void savePolicy(parsed.data);
  }

  const confirmationChange = confirmationRequest
    ? policyChangeConfirmation(view.policy ?? initialDeploymentPolicy, confirmationRequest)
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <CapabilityCard view={view} />

      {!view.policy ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Deployment Policy is missing</AlertTitle>
          <AlertDescription>
            Demo entry and signup are closed. Save the reviewed defaults to restore the record.
          </AlertDescription>
        </Alert>
      ) : null}

      <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Admission</CardTitle>
            <CardDescription>
              Requested access. Runtime capability remains authoritative.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldSet>
              <FieldLegend className="sr-only">Admission settings</FieldLegend>
              <FieldGroup>
                <Field orientation="horizontal">
                  <Checkbox
                    id="accept-new-demos"
                    checked={policy.acceptNewDemos}
                    onCheckedChange={(checked) =>
                      setPolicy((current) => ({ ...current, acceptNewDemos: checked }))
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="accept-new-demos">Accept new demos</FieldLabel>
                    <FieldDescription>
                      Existing environments continue when this is turned off.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="pause-all-demo-access"
                    checked={policy.pauseAllDemoAccess}
                    onCheckedChange={(checked) =>
                      setPolicy((current) => ({ ...current, pauseAllDemoAccess: checked }))
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="pause-all-demo-access">Pause all demo access</FieldLabel>
                    <FieldDescription>
                      Emergency access stop, separate from admission.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="sign-up-enabled"
                    checked={policy.signUpEnabled}
                    onCheckedChange={(checked) =>
                      setPolicy((current) => ({ ...current, signUpEnabled: checked }))
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="sign-up-enabled">Enable durable signup</FieldLabel>
                    <FieldDescription>
                      Requires healthy mail and password recovery.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </FieldSet>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Environment limits</CardTitle>
            <CardDescription>
              Lower values block new use. They never remove existing data or restore lifetime use.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {environmentFields.map((field) => (
                <PolicyNumberField
                  key={field.key}
                  field={field}
                  value={policy[field.key]}
                  onChange={(value) => setNumber(field.key, value)}
                />
              ))}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Global limits</CardTitle>
            <CardDescription>
              Fleet-wide admission and concurrent pressure ceilings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {globalFields.map((field) => (
                <PolicyNumberField
                  key={field.key}
                  field={field}
                  value={policy[field.key]}
                  onChange={(value) => setNumber(field.key, value)}
                />
              ))}
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-between gap-3 border-t">
            <div className="flex flex-col gap-1 text-muted-foreground">
              <span>
                {draftImpact.writeLimitedEnvironmentCount} active environments are above the draft
                limits.
              </span>
              <span>
                {view.lastUpdated
                  ? `Last saved ${new Date(view.lastUpdated.at).toLocaleString()} by ${view.lastUpdated.by ? "the Platform Operator" : "migration defaults"}.`
                  : "No stored policy record."}
              </span>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ShieldCheckIcon data-icon="inline-start" />
              )}
              Save policy
            </Button>
          </CardFooter>
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
      </form>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply impactful policy reduction?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmationChange?.reducedFields.length
                ? `${confirmationChange.reducedFields.length} hard-bounded ceilings will be lowered. `
                : ""}
              {confirmationImpact.writeLimitedEnvironmentCount} current Demo Environments will be
              above the requested limits. Existing data is not deleted, but additional writes can be
              refused.
              {confirmationChange?.pausesAllDemoAccess
                ? " All current Demo Environment access will also pause."
                : ""}
              {confirmationChange?.closesDemoAdmission ? " New demo admission will close." : ""}
              {confirmationChange?.closesSignUp ? " Durable signup will close." : ""}
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
