import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent,
} from "@ionic/react";
import { useParams } from "react-router-dom";
import { RECORD } from "../data";
import { JobBlockBody } from "../pieces";

/* MOVE 1's other half. The five job blocks are routes at every width: below 1024
   this plane is what a push-row opens; at 1024 and above the same JobBlockBody
   renders in the canvas beside the list. One IA, one component, no disclosure. */
export function JobBlockPage() {
  const { ref, block } = useParams<{ ref: string; block: string }>();
  const name = block.charAt(0).toUpperCase() + block.slice(1);

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/record/${ref}`} text="" aria-label="Back to the record" />
          </IonButtons>
          <div className="ident">
            <h1>{name}</h1>
            <span className="sub">{RECORD.ref} · {RECORD.title}</span>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <JobBlockBody block={block} />
      </IonContent>
    </IonPage>
  );
}
