/**
 * INVENTORY ADAPTER — a pure data-conversion layer (no page or network access).
 * Saved OCR shape: { "five-stars": { "set-name": { "1": artifact } } }.
 * UI shape: an array of artifacts with readable labels and formatted values.
 * We never modify the input object. That keeps the OCR storage format stable.
 * Read this file first, then script.js, then get_images.js.
 */
(function(root) {
  // Convert storage bucket names to numbers used by filters and star icons.
const rarities= {
    'one-star':1,'two-stars':2,'three-stars':3,'four-stars':4,'five-stars':5
  }
  ;
  // Special spellings that ordinary title-casing would get wrong.
const names= {
    hp:'HP',atk:'ATK',def:'DEF','crit-rate':'CRIT Rate','crit-dmg':'CRIT DMG','energy-recharge':'Energy Recharge','elemental-mastery':'Elemental Mastery','healing-bonus':'Healing Bonus'
  }
  ;
  // Turn a slug such as noblesse-oblige into Noblesse Oblige.
const title=v=>String(v).split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  // The % suffix describes the UNIT; remove it from the label only.
const label=k=>names[k.replace(/%$/,'')]||title(k.replace(/%$/,'')).replace(/Dmg/g,'DMG');
  // Add % back to the value when the stored key requests it. Flat stats stay flat.
  // Null/undefined becomes a dash; zero remains zero. Locale formatting adds thousands separators.
const value=(k,n)=>n==null?'—':`${typeof n==='number'?n.toLocaleString('en-US',{maximumFractionDigits:2}):n}${k.endsWith('%')?'%':''}`;
  // Convert all rarity/set/ID buckets into one array. Empty buckets add nothing.
function normalize(data) {
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Inventory data has an unexpected format.');
    const result=[];
    for(const [rarity,sets] of Object.entries(data)) {
      if(!rarities[rarity]||!sets||typeof sets!=='object')continue;
      for(const [setKey,items] of Object.entries(sets)) {
        if(!items||typeof items!=='object')continue;
        for(const [id,a] of Object.entries(items)) {
          if(!a||typeof a!=='object')continue;
          // mainstat is a one-entry object. Object.entries produces [key, value] pairs.
const main=Object.entries(a.mainstat|| {
          }
          )[0];
          // Include rarity and set in the ID because IDs may repeat in different buckets.
        // order preserves traversal order; it is not the time the artifact was scanned.
        // ?? supplies a default only for null/undefined, not for a legitimate level 0.
result.push( {
            id:`${rarity}/${setKey}/${id}`,order:result.length,setKey,set:title(setKey),slot:title(a.slot||'Unknown'),level:a.level??0,rarity:rarities[rarity],main:main?label(main[0]):'Unknown stat',value:main?value(...main):'—',stats:Object.entries(a.substats|| {
            }
            ).map(([k,n])=>[label(k),value(k,n)]),equipped:a.equipped||'',locked:a.locked===true
          }
          );
        }
      }
    }
    return result;
  }
  // Expose Inventory to ordinary browser scripts through globalThis.
root.Inventory= {
    normalize
  }
  ;
  // CommonJS export lets Node tests use the same adapter without a browser.
if(typeof module!=='undefined')module.exports=root.Inventory;
}
)(globalThis);
