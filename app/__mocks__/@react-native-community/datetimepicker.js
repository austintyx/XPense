const React = require("react");
const { Pressable } = require("react-native");

// The real component is a native platform picker with no meaningful jsdom-less render target --
// this stand-in renders as a pressable test hook that fires onChange with a fixed, known date,
// so tests can simulate "the person picked a different date" deterministically.
const MOCK_PICKED_DATE = new Date(2025, 0, 15); // Jan 15, 2025 (local calendar date)

function DateTimePicker({ testID, onChange }) {
  return React.createElement(Pressable, {
    testID: testID ?? "date-time-picker",
    onPress: () => onChange?.({ type: "set" }, MOCK_PICKED_DATE),
  });
}

module.exports = DateTimePicker;
module.exports.default = DateTimePicker;
module.exports.MOCK_PICKED_DATE = MOCK_PICKED_DATE;
