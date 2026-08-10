import { redirect } from 'next/navigation';

export default function MachineHealthRedirectPage() {
  redirect('/maintenance');
}

