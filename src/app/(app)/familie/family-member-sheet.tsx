"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  MemberForm,
  type MemberFormValues,
  type MemberOption,
} from "@/components/ordilo/member-form";
import {
  OrdiloDrawer,
  OrdiloDrawerBody,
  OrdiloDrawerHeader,
} from "@/components/ordilo/ordilo-drawer";

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
  otherMembers: MemberOption[];
  initialValues?: MemberFormValues;
  memberId?: string;
  photoUrl?: string | null;
  onPhotoChange?: (url: string | null) => void;
  formKey?: string;
}) {
  return (
    <OrdiloDrawer variant="form" open={open} onOpenChange={onOpenChange}>
      <OrdiloDrawerHeader title={title} description={description} />
      <OrdiloDrawerBody>
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
      </OrdiloDrawerBody>
    </OrdiloDrawer>
  );
}
