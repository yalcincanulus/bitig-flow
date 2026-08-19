import { buttonVariants } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export function ViewerUploadingState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-base text-muted-foreground">This Document is still uploading.</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(buttonVariants({ variant: "default" }), "h-14 w-full rounded-lg text-base")}
      >
        Retry
      </button>
    </div>
  );
}
