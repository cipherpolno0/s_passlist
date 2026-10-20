export function safeReturnPath(value: string | null | undefined, fallback='/admin') {
  if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return fallback;
  try {const url=new URL(value,'https://app.local');
    if(url.origin!=='https://app.local'||/^\/(?:auth|login|forgot-password|reset-password)(?:\/|$)/.test(url.pathname))return fallback;
    return url.pathname+url.search+url.hash;
  }catch{return fallback;}
}
