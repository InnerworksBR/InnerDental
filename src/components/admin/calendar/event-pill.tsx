import type { CalendarItem } from "@/lib/admin/calendar-grid";

type Props = {
  item: CalendarItem;
  onClick?: (item: CalendarItem) => void;
  compact?: boolean;
};

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function EventPill({ item, onClick, compact }: Props) {
  const className = ["cal-event"];
  if (item.kind === "calendar") className.push("cal-event--calendar");
  if (item.kind === "block") className.push("cal-event--block");
  if (compact) className.push("cal-event--pill");
  const handle = () => onClick?.(item);

  if (item.kind === "appointment") {
    return (
      <button type="button" className={className.join(" ")} onClick={handle}>
        {compact ? (
          <span>{timeFormatter.format(new Date(item.startAt))} · {item.label.split(" ")[0]}</span>
        ) : (
          <>
            <time dateTime={item.startAt}>{timeFormatter.format(new Date(item.startAt))}</time>
            <b>{item.label}</b>
            <small>{item.professionalName}</small>
          </>
        )}
      </button>
    );
  }
  if (item.kind === "calendar") {
    return (
      <button type="button" className={className.join(" ")} onClick={handle}>
        {compact ? (
          <span>{item.title.slice(0, 20)}</span>
        ) : (
          <>
            <time dateTime={item.startAt}>{timeFormatter.format(new Date(item.startAt))}</time>
            <b>{item.title}</b>
            <small>{item.professionalName} · Google Calendar</small>
          </>
        )}
      </button>
    );
  }
  return (
    <button type="button" className={className.join(" ")} onClick={handle}>
      {compact ? (
        <span>Bloqueio · {item.professionalName}</span>
      ) : (
        <>
          <time dateTime={item.startAt}>Dia todo</time>
          <b>Bloqueio</b>
          <small>{item.professionalName}</small>
        </>
      )}
    </button>
  );
}
