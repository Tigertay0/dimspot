"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/lib/hooks/use-is-desktop";

/**
 * Sheet — a Dialog anchored to an edge.
 *
 * The whole mobile UI is built on this: filters, report and detail all slide up
 * from the bottom so they stay in thumb reach, which is the layout the PRD asks
 * for in section 5.1.
 */

/**
 * Where a docked sheet is drawn on a wide screen: the list column beside the
 * map. The shell provides the element; without one, nothing docks.
 */
const SheetDockTarget = React.createContext<HTMLElement | null>(null);
const SheetDocked = React.createContext(false);

/**
 * `dock`: on a wide screen, open in the list column instead of over the page.
 * The sheet is then part of the layout, not a modal: the map beside it stays
 * usable, and panning it does not dismiss the sheet.
 */
function Sheet({
  dock = false,
  modal,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & { dock?: boolean }) {
  const target = React.useContext(SheetDockTarget);
  const desktop = useIsDesktop();
  const docked = dock && desktop && target !== null;

  return (
    <SheetDocked.Provider value={docked}>
      <DialogPrimitive.Root modal={docked ? false : modal} {...props} />
    </SheetDocked.Provider>
  );
}

const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-card text-card-foreground transition ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-[350ms]",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        // dvh, not vh: on iOS Safari 100vh includes the area under the
        // toolbar, so a sheet sized in vh hides its own footer behind it.
        // pb-safe keeps the last row clear of the home indicator.
        bottom:
          // From lg up it is a centred dialog: a sheet glued to the bottom
          // edge of a wide window is a phone layout in the wrong place.
          cn(
            "inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl pb-safe shadow-[var(--shadow-sheet)] dark:border dark:border-b-0 dark:border-border sm:mx-auto sm:max-w-lg",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            "lg:bottom-auto lg:top-1/2 lg:max-h-[min(86dvh,780px)] lg:-translate-y-1/2 lg:rounded-3xl lg:pb-0 lg:shadow-[var(--shadow-float)] lg:dark:border-b",
            "lg:data-[state=closed]:fade-out-0 lg:data-[state=closed]:slide-out-to-bottom-4 lg:data-[state=open]:fade-in-0 lg:data-[state=open]:slide-in-from-bottom-4",
          ),
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-md",
      },
    },
    defaultVariants: { side: "bottom" },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Hide the built-in close button when the content supplies its own. */
  hideClose?: boolean;
  /**
   * Leave the page behind undimmed. For a sheet that works together with the
   * map (placing a report), used with a non-modal Sheet.
   */
  noOverlay?: boolean;
}

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = "bottom", className, children, hideClose, noOverlay, onInteractOutside, ...props }, ref) => {
  const docked = React.useContext(SheetDocked);
  const target = React.useContext(SheetDockTarget);

  return (
    <SheetPortal container={docked ? target : undefined}>
      {!noOverlay && !docked && <SheetOverlay />}
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          docked
            ? // Fills the list column. The caller's classes are for the phone
              // sheet (heights, radii), so they are not applied here.
              "absolute inset-0 z-20 flex flex-col bg-card text-card-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-2 data-[state=open]:duration-200"
            : cn(sheetVariants({ side }), className),
        )}
        onInteractOutside={docked ? (event) => event.preventDefault() : onInteractOutside}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="tap-target absolute right-5 top-5 flex size-8 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = "SheetContent";

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1 px-6 pb-4 pt-5 text-left", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-3 border-t px-6 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-[22px] font-semibold leading-tight tracking-[-0.02em]", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetDockTarget,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
