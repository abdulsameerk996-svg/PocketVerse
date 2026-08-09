import { Stack } from 'expo-router';
export default function DebugLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#08080F' } }} />;
}
