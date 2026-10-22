"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export interface OptionDraft {
  optionId: string;
  name: string;
  priceRupees: string;
  active: boolean;
}

export interface OptionGroupDraft {
  groupId: string;
  name: string;
  type: "single" | "multiple";
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: OptionDraft[];
}

function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
}

export function newOptionGroupDraft(): OptionGroupDraft {
  return {
    groupId: newId("g"),
    name: "",
    type: "single",
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { optionId: newId("o"), name: "", priceRupees: "0", active: true },
    ],
  };
}

interface OptionGroupsEditorProps {
  groups: OptionGroupDraft[];
  onChange: (groups: OptionGroupDraft[]) => void;
}

/**
 * Tenant-managed option groups (size, add-ons, spice level). The restaurant
 * configures the groups; the server resolves names and prices at order time.
 */
export function OptionGroupsEditor({
  groups,
  onChange,
}: OptionGroupsEditorProps) {
  const updateGroup = (
    groupId: string,
    patch: Partial<OptionGroupDraft>
  ) => {
    onChange(
      groups.map((group) =>
        group.groupId === groupId ? { ...group, ...patch } : group
      )
    );
  };

  const updateOption = (
    groupId: string,
    optionId: string,
    patch: Partial<OptionDraft>
  ) => {
    onChange(
      groups.map((group) =>
        group.groupId === groupId
          ? {
              ...group,
              options: group.options.map((option) =>
                option.optionId === optionId ? { ...option, ...patch } : option
              ),
            }
          : group
      )
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Options &amp; add-ons</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...groups, newOptionGroupDraft()])}
        >
          <Plus data-icon="inline-start" />
          Add group
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No options yet. Products without options can be added straight to the
          cart.
        </p>
      ) : null}

      {groups.map((group, groupIndex) => (
        <div key={group.groupId} className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Input
              value={group.name}
              placeholder="Size, Add-ons, Spice level"
              onChange={(e) =>
                updateGroup(group.groupId, { name: e.target.value })
              }
              aria-label={`Option group ${groupIndex + 1} name`}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Delete option group"
              onClick={() =>
                onChange(groups.filter((g) => g.groupId !== group.groupId))
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Type</Label>
              <select
                value={group.type}
                onChange={(e) => {
                  const type = e.target.value === "multiple" ? "multiple" : "single";
                  updateGroup(group.groupId, {
                    type,
                    maxSelections:
                      type === "single" ? 1 : Math.max(group.maxSelections, 1),
                  });
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="single">Choose one</option>
                <option value="multiple">Choose many</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min</Label>
              <Input
                type="number"
                min={0}
                max={20}
                value={group.minSelections}
                onChange={(e) =>
                  updateGroup(group.groupId, {
                    minSelections: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={group.maxSelections}
                onChange={(e) =>
                  updateGroup(group.groupId, {
                    maxSelections: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Switch
              checked={group.required}
              onCheckedChange={(checked) =>
                updateGroup(group.groupId, {
                  required: checked,
                  minSelections: checked ? Math.max(1, group.minSelections) : 0,
                })
              }
            />
            <Label className="text-xs text-muted-foreground">
              Customer must choose
            </Label>
          </div>

          <Separator className="my-3" />

          <div className="space-y-2">
            {group.options.map((option) => (
              <div key={option.optionId} className="flex items-center gap-2">
                <Input
                  value={option.name}
                  placeholder="Option name"
                  onChange={(e) =>
                    updateOption(group.groupId, option.optionId, {
                      name: e.target.value,
                    })
                  }
                  aria-label="Option name"
                />
                <Input
                  className="w-24"
                  value={option.priceRupees}
                  onChange={(e) =>
                    updateOption(group.groupId, option.optionId, {
                      priceRupees: e.target.value,
                    })
                  }
                  aria-label="Extra price in rupees"
                  placeholder="+0"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Delete option"
                  onClick={() =>
                    updateGroup(group.groupId, {
                      options: group.options.filter(
                        (o) => o.optionId !== option.optionId
                      ),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                updateGroup(group.groupId, {
                  options: [
                    ...group.options,
                    {
                      optionId: newId("o"),
                      name: "",
                      priceRupees: "0",
                      active: true,
                    },
                  ],
                })
              }
            >
              <Plus data-icon="inline-start" />
              Add option
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
