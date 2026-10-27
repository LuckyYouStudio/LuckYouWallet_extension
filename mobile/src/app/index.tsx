import { Redirect } from 'expo-router';
import { useWallet } from '@/state/WalletContext';

export default function Index() {
  const { status } = useWallet();
  if (status === 'onboarding') return <Redirect href="/welcome" />;
  if (status === 'locked') return <Redirect href="/unlock" />;
  return <Redirect href="/home" />;
}
