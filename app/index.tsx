import { Redirect } from 'expo-router';

/** Entry point — the hub is the app's home. */
export default function Index() {
  return <Redirect href="/(hub)/home" />;
}
