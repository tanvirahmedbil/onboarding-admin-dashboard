import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { firebaseConfigured, getDashboardFirestore } from "./firebase";
import { mapProject, type DashboardProject } from "./reporting";

export function subscribeDashboard(
  onChange: (projects: DashboardProject[]) => void,
  onError: (message: string) => void
) {
  if (!firebaseConfigured) return () => {};

  let dm: DashboardProject[] = [];
  let seo: DashboardProject[] = [];
  let dmReady = false;
  let seoReady = false;
  let cancelled = false;
  let unsubs: Unsubscribe[] = [];

  const publish = () => {
    if (cancelled || !dmReady || !seoReady) return;
    onChange([...dm, ...seo]);
  };

  try {
    const db = getDashboardFirestore();
    unsubs = [
      onSnapshot(
        collection(db, "dmProjects"),
        (snapshot) => {
          dm = snapshot.docs.map((entry) => mapProject(entry.id, "dm", entry.data()));
          dmReady = true;
          publish();
        },
        (reason) => onError(`Digital Marketing data could not load: ${reason.message}`)
      ),
      onSnapshot(
        collection(db, "projects"),
        (snapshot) => {
          seo = snapshot.docs.map((entry) => mapProject(entry.id, "seo", entry.data()));
          seoReady = true;
          publish();
        },
        (reason) => onError(`SEO data could not load: ${reason.message}`)
      ),
    ];
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unable to connect to Firestore.";
    queueMicrotask(() => {
      if (!cancelled) onError(message);
    });
  }

  return () => {
    cancelled = true;
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
