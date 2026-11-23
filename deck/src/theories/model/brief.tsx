import { fmt } from "../../data";
import { BarChart, Caption, H, Note, P } from "../../ui";
import { bars, blockSizes } from "./results";

/* The brief edition's slide for model/4: the whole model in one view, with its measured ranking. */

export function BriefModelPanel() {
  const s = blockSizes();
  return (
    <>
      <H>A small model that averages a history ranks well above popularity, and below the item-based methods.</H>
      <P>
        A place is a direction made of its text description plus a learned part. A user has no vector of their own: it
        is the mean of the vectors of the places in their history. Training hides half of each history and asks the
        model to rank the hidden places near the top.
      </P>
      <P>
        Text alone made similar places look alike, so the first version ranked like MostPopular, which gives everyone
        the same list, and was replaced. The model keeps {fmt.int(s.total)} numbers, small on purpose.
      </P>
      <Note>NDCG@10 scores how near the top of ten recommendations a hidden visit lands.</Note>
    </>
  );
}

export function BriefModelStage() {
  const data = bars("ndcg@10");
  const show = (v: number) => fmt.ndcg(v);
  return (
    <>
      <BarChart
        yLabel=""
        format={show}
        data={data}
        summary={`NDCG@10 on the test split: ${data.map((d) => `${d.label} ${show(d.value)}`).join(", ")}.`}
      />
      <Caption>
        Test split, no privacy noise, whiskers are 95% intervals. Fed. is the hybrid model trained with large or small
        groups of users per round. ItemKNN and item ridge read everyone's history in one place.
      </Caption>
    </>
  );
}
