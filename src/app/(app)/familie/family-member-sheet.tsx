"use client";

import type { Dispatch, SetStateAction } from "react";
import { MemberForm, type MemberFormValues } from "@/components/ordilo/member-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Database } from "@/types/database";

type MemberRow = Database["public"]["Tables"]["family_members"]["Row"];

export function FamilyMemberSheet({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  isSubmitting,
  validationError,
  serverError,
  onClearValidationError,
  onClearServerError,
  otherMembers,
  initialValues,
  memberId,
  photoUrl,
  onPhotoChange,
  formKey,
}: {
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>> | ((open: boolean) => void);
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (values: MemberFormValues) => void | Promise<void>;
  isSubmitting: boolean;
  validationError: string | null;
  serverError: string | null;
  onClearValidationError: () => void;
  onClearServerError: () => void;
  otherMembers: MemberRow[];
  initialValues?: MemberFormValues;
  memberId?: string;
  photoUrl?: string | null;
  onPhotoChange?: (url: string | null) => void;
  formKey?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-ordilo-xl"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <MemberForm
            key={formKey}
            initialValues={initialValues}
            submitLabel={submitLabel}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
            validationError={validationError}
            serverError={serverError}
            onClearValidationError={onClearValidationError}
            onClearServerError={onClearServerError}
            memberId={memberId}
            photoUrl={photoUrl}
            onPhotoChange={onPhotoChange}
            otherMembers={otherMembers}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
