export const AWAITING = /^(open|customer-reply)$/i;
export const ticketTone = (s: string) =>
  /^open$/i.test(s) ? 'red' : /customer-reply/i.test(s) ? 'yellow' : /answered/i.test(s) ? 'green' : /progress|hold/i.test(s) ? 'blue' : 'gray';
export const priorityTone = (p: string) => (/high/i.test(p) ? 'red' : /low/i.test(p) ? 'gray' : 'yellow');
