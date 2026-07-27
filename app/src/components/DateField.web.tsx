import { fromDateString, toDateString } from "../utils/dateSerialization";

interface DateFieldProps {
  testID?: string;
  value: Date;
  maximumDate?: Date;
  onChange: (date: Date) => void;
}

// @react-native-community/datetimepicker ships no web build (its fallback renders null and just
// warns "not supported on: web"), so the web platform gets a plain HTML date input instead --
// same Date-in/Date-out contract as DateField.tsx, via the same not-toISOString() serialization
// the rest of the sync-backfill flow already relies on.
export function DateField({ testID, value, maximumDate, onChange }: DateFieldProps) {
  return (
    <input
      data-testid={testID}
      type="date"
      value={toDateString(value)}
      max={maximumDate ? toDateString(maximumDate) : undefined}
      onChange={(event) => {
        if (event.target.value) onChange(fromDateString(event.target.value));
      }}
    />
  );
}
