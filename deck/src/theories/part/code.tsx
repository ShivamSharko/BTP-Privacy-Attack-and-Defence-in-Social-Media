import { CodeView, H, Note, P } from "../../ui";

export function AvailabilityCodePanel() {
  return (
    <>
      <H>One function gives every user a chance of being free, and another measures the gap.</H>
      <P>
        <code>availability_vector</code> returns one probability per user, in the floor to 1 range and exactly 1 for
        "always". The activity and social scenarios map each user's rank onto the range from the floor to twice the mean
        minus the floor, so the average is the configured mean and nothing passes 1.
      </P>
      <P>
        <code>match_devices_by_rank</code> pairs users with trace devices: larger key, larger active share, each device
        used once, ties broken at random. <code>group_gap</code> is the top third's mean minus the bottom third's, with
        a bootstrap over users for the interval.
      </P>
      <Note tone="warn">Both ranks look at all users, so epsilon is nominal there. NumPy and SciPy do the ranking.</Note>
    </>
  );
}

export function AvailabilityCodeStage() {
  return <CodeView refs={["fl/availability.py::availability_vector", "fl/availability.py::match_devices_by_rank", "fl/availability.py::group_gap"]} />;
}

export function TraceCodePanel() {
  return (
    <>
      <H>The trace is a pickle from outside the project, so it is opened with a loader that allows one type.</H>
      <P>
        A pickle is a recipe for rebuilding objects, and loading one can import modules and call functions. A crafted
        file could run code on the machine. <code>RestrictedUnpickler</code> overrides <code>find_class</code>, which
        pickle calls for every global it needs, and allows only <code>collections.OrderedDict</code>. Anything else
        raises an error.
      </P>
      <P>
        <code>load_device_traces</code> then checks the shape and keeps only the availability intervals and the trace
        length. <code>availability_schedule</code> says, for each round and user, whether the device is active, reading
        the trace in a loop.
      </P>
      <Note>The file stays under the git-ignored data folder and is never redistributed. Python's pickle module and NumPy.</Note>
    </>
  );
}

export function TraceCodeStage() {
  return (
    <CodeView
      refs={["data/traces.py::RestrictedUnpickler", "data/traces.py::load_device_traces", "data/traces.py::availability_schedule"]}
      highlight={{ "data/traces.py::RestrictedUnpickler": [[34, 37]] }}
    />
  );
}
