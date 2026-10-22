"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;
const SelectTrigger = SelectPrimitive.Trigger;
const SelectScrollUpButton = SelectPrimitive.ScrollUpButton;
const SelectScrollDownButton = SelectPrimitive.ScrollDownButton;
const SelectContent = SelectPrimitive.Content;
const SelectLabel = SelectPrimitive.Label;
const SelectItem = SelectPrimitive.Item;
const SelectSeparator = SelectPrimitive.Separator;

const SelectTriggerComponent = React.forwardRef<
  React.ElementRef<typeof SelectTrigger>,
  React.ComponentPropsWithoutRef<typeof SelectTrigger>
>(({ className, children, ...props }, ref) => (
  <SelectTrigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon />
    </SelectPrimitive.Icon>
  </SelectTrigger>
));
SelectTriggerComponent.displayName = SelectTrigger.displayName;

const SelectContentComponent = React.forwardRef<
  React.ElementRef<typeof SelectContent>,
  React.ComponentPropsWithoutRef<typeof SelectContent>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPortal>
    <SelectContent
      ref={ref}
      position={position}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-input bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    >
      {children}
    </SelectContent>
  </SelectPortal>
));
SelectContentComponent.displayName = SelectContent.displayName;

const SelectItemComponent = React.forwardRef<
  React.ElementRef<typeof SelectItem>,
  React.ComponentPropsWithoutRef<typeof SelectItem>
>(({ className, children, ...props }, ref) => (
  <SelectItem
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectItemText>{children}</SelectItemText>
  </SelectItem>
));
SelectItemComponent.displayName = SelectItem.displayName;

const SelectItemText = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ItemText>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ItemText>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ItemText
    ref={ref}
    className={cn("truncate", className)}
    {...props}
  />
));
SelectItemText.displayName = SelectPrimitive.ItemText.displayName;

const SelectSeparatorComponent = React.forwardRef<
  React.ElementRef<typeof SelectSeparator>,
  React.ComponentPropsWithoutRef<typeof SelectSeparator>
>(({ className, ...props }, ref) => (
  <SelectSeparator
    ref={ref}
    className={cn("-mx-1 h-px bg-border", className)}
    {...props}
  />
));
SelectSeparatorComponent.displayName = SelectSeparator.displayName;

const SelectLabelComponent = React.forwardRef<
  React.ElementRef<typeof SelectLabel>,
  React.ComponentPropsWithoutRef<typeof SelectLabel>
>(({ className, ...props }, ref) => (
  <SelectLabel
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", className)}
    {...props}
  />
));
SelectLabelComponent.displayName = SelectLabel.displayName;

const SelectScrollUpButtonComponent = React.forwardRef<
  React.ElementRef<typeof SelectScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center px-1 text-shrink-0", className)}
    {...props}
  >
    <SelectPrimitive.Icon asChild>
      <ChevronUpIcon />
    </SelectPrimitive.Icon>
  </SelectScrollUpButton>
));
SelectScrollUpButtonComponent.displayName = SelectScrollUpButton.displayName;

const SelectScrollDownButtonComponent = React.forwardRef<
  React.ElementRef<typeof SelectScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center px-1 text-shrink-0", className)}
    {...props}
  >
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon />
    </SelectPrimitive.Icon>
  </SelectScrollDownButton>
));
SelectScrollDownButtonComponent.displayName = SelectScrollDownButton.displayName;

const SelectPortal = ({ children }: { children: React.ReactNode }) => {
  return <SelectPrimitive.Portal>{children}</SelectPrimitive.Portal>;
};

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTriggerComponent as SelectTrigger,
  SelectScrollUpButtonComponent as SelectScrollUpButton,
  SelectScrollDownButtonComponent as SelectScrollDownButton,
  SelectContentComponent as SelectContent,
  SelectLabelComponent as SelectLabel,
  SelectItemComponent as SelectItem,
  SelectSeparatorComponent as SelectSeparator,
  SelectItemText,
};
