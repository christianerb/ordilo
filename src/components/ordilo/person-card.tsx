import { Cake } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGermanDate, getDaysUntilBirthday } from "@/lib/format";
import { CardActions } from "@/components/ordilo/card-actions";

const DEFAULT_AVATAR_COLOR = "#305460";

export interface PersonCardProps {
  name: string;
  role?: string | null;
  birthdate?: string | null;
  avatarColor?: string | null;
  documentCount?: number;
  onClick?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function PersonCard({
  name,
  role,
  birthdate,
  avatarColor,
  documentCount,
  onClick,
  onEdit,
  onRemove,
  className,
}: PersonCardProps) {
  const color = avatarColor || DEFAULT_AVATAR_COLOR;
  const initial = name.charAt(0).toUpperCase() || "?";
  const formattedBirthdate = formatGermanDate(birthdate);
  const hasActions = Boolean(onEdit || onRemove);
  const daysUntilBirthday = getDaysUntilBirthday(birthdate);
  const birthdaySoon = daysUntilBirthday !== null && daysUntilBirthday <= 7;
  const birthdayToday = daysUntilBirthday === 0;

  const metaParts: string[] = [];
  if (role && role.trim()) metaParts.push(role);
  if (formattedBirthdate) metaParts.push(formattedBirthdate);
  if (documentCount !== undefined && documentCount > 0) {
    metaParts.push(documentCount === 1 ? "1 Dokument" : `${documentCount} Dokumente`);
  }
  const metaText = metaParts.join(" · ");

  const content = (
    <div className="flex items-center gap-2.5">
      <div
        className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        {initial}
        {birthdaySoon && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full border-2 border-card",
              birthdayToday ? "bg-[var(--apricot)]" : "bg-[var(--apricot-light)]",
            )}
            title={
              birthdayToday
                ? "Heute Geburtstag"
                : daysUntilBirthday === 1
                  ? "Morgen Geburtstag"
                  : `In ${daysUntilBirthday} Tagen Geburtstag`
            }
          >
            <Cake className="size-2 text-white" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {metaText && (
          <p className="truncate text-xs text-muted-foreground">{metaText}</p>
        )}
      </div>
    </div>
  );

  const contentWrapper = onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-ordilo-sm"
      aria-label={`${name} öffnen`}
    >
      {content}
    </button>
  ) : (
    <div className="flex flex-1 items-center">{content}</div>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-ordilo-sm border border-border bg-card p-2.5 transition-colors hover:bg-accent/30",
        className,
      )}
    >
      {contentWrapper}
      {hasActions && (
        <CardActions onEdit={onEdit} onDelete={onRemove} testId="person-card-actions" />
      )}
    </div>
  );
}
