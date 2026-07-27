import DateTimePicker from "@react-native-community/datetimepicker";

interface DateFieldProps {
  testID?: string;
  value: Date;
  maximumDate?: Date;
  onChange: (date: Date) => void;
}

export function DateField({ testID, value, maximumDate, onChange }: DateFieldProps) {
  return (
    <DateTimePicker
      testID={testID}
      value={value}
      mode="date"
      maximumDate={maximumDate}
      onChange={(_event, selected) => {
        if (selected) onChange(selected);
      }}
    />
  );
}
