import type { CSSProperties } from "react";
import { fact } from "../../data";
import { useDeck } from "../../deck/store";
import { Button, Buttons, Caption, Controls, H, P } from "../../ui";

const BIG: CSSProperties & Record<"--t-head", string> = { "--t-head": "calc(3.65 * var(--u))" };

/** Named as the project's own pre-registration names the guide; the export checks the quote. */
export const GUIDE = String(fact("people.guide").value);

function open(id: string): void {
  window.location.hash = `#/${id}`;
}

/** The last slide: thanks, and a way back into the deck for questions. */
export function ThanksPanel() {
  const toggleOverview = useDeck((s) => s.toggleOverview);
  return (
    <>
      <div style={BIG}>
        <H>Thank you.</H>
      </div>
      <P>
        We thank <strong>{GUIDE}</strong>, who guided this project, and the panel for their time and attention.
      </P>
      <P>Questions are welcome. Any slide can be opened again from here.</P>
      <Controls>
        <Buttons>
          <Button onClick={toggleOverview}>All slides</Button>
          <Button kind="quiet" onClick={() => open("intro/1")}>
            Back to the start
          </Button>
          <Button kind="quiet" onClick={() => open("outro/1")}>
            The live sandbox
          </Button>
        </Buttons>
        <Caption>
          The scene behind is the sandbox from the start of this closing, at rest. It is an illustration, not a result.
        </Caption>
      </Controls>
    </>
  );
}
