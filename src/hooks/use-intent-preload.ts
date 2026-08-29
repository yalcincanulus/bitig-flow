import { useEffect, useState } from "react";

import { createIntentPreloadController } from "#/lib/intent-preload";

export type IntentPreloadLinkProps = Readonly<{
  preload: false;
  onFocus: () => void;
  onBlur: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTouchStart: () => void;
  onClick: () => void;
}>;

/**
 * Keeps intent preloading useful without letting repeated pointer passes rerun route guards.
 * Brief pointer passes are ignored; a successful preload stays fresh for the same duration as the
 * router's default preload cache. Multiple Links can share the returned props for one destination.
 */
export function useIntentPreload({
  preload,
  scope,
  active = false,
}: Readonly<{
  preload: () => Promise<unknown>;
  scope: string;
  active?: boolean;
}>) {
  const [controller] = useState(() => createIntentPreloadController({ preload, active }));

  useEffect(() => {
    controller.update({ preload, active });
  }, [active, controller, preload]);

  useEffect(() => {
    controller.reset();
    return controller.reset;
  }, [controller, scope]);

  const linkProps: IntentPreloadLinkProps = {
    // The hook owns intent freshness so repeated hovers do not rerun parent beforeLoad hooks.
    preload: false,
    onFocus: controller.queuePreload,
    onBlur: controller.cancelQueuedPreload,
    onMouseEnter: controller.queuePreload,
    onMouseLeave: controller.cancelQueuedPreload,
    onTouchStart: controller.preloadNow,
    onClick: controller.cancelQueuedPreload,
  };

  return { linkProps, cancelQueuedPreload: controller.cancelQueuedPreload } as const;
}
