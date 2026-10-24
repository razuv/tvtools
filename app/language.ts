export function initialLanguage(mobile:boolean,languages:readonly string[],saved:string|null):"ru"|"en" {
  if(mobile)return languages[0]?.toLowerCase().startsWith("ru")?"ru":"en";
  return saved==="ru"?"ru":"en";
}
