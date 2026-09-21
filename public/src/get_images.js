/**
 * SCREENSHOT IMPORT — browser side only. server.cjs does the actual saving/OCR.
 * Choose/drop files → validate → POST /api/images (one file per request).
 * Scan button → POST /api/scan → refreshInventory() from script.js.
 * Uploading alone does not create artifact cards; scanning is a separate step.
 * The outer immediately invoked function keeps these variables private.
 */
// Import and scan use the existing local server endpoints.
(() =>  {
  const dialog=document.getElementById('file_selector');
  const fileInput=document.getElementById('file-input');
  const scanButton=document.getElementById('scan-images');
  const scanStatus=document.getElementById('scan-status');
  const uploadStatus=document.getElementById('upload-status');
  const dropZone=document.getElementById('drop-zone');
  // Prevent overlapping uploads/scans within this page.
let busy=false;
  // Disable both upload selection and scanning until the active operation finishes.
function setBusy(value) {
    busy=value;
    scanButton.disabled=value;
    fileInput.disabled=value;
    dropZone.classList.toggle('busy',value);
  }
  // Use textContent for messages so filenames/errors cannot become HTML.
  // CSS uses error/success classes for feedback colors.
function status(node,message,tone='') {
    node.textContent=message;
    node.className=`operation-status ${tone}`;
  }
  // Native dialogs provide modal focus handling and Escape-to-close behavior.
  // Closing hides the dialog; it does not cancel an upload or server-side scan.
document.getElementById('image_trigger').addEventListener('click',()=>dialog.showModal());
  document.getElementById('cancel-file-selection').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=> {
    fileInput.value='';
  }
  );
  // Check type, byte size and decoded dimensions before uploading.
  // The server must still validate independently; browser checks are for feedback.
async function validateImages(files) {
    const accepted=[],rejected=[];
    for(const file of files) {
      let bitmap;
      try  {
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)) {
          rejected.push(`${file.name}: use PNG, JPEG or WebP.`);
          continue;
        }
        if(file.size>15*1024*1024) {
          rejected.push(`${file.name}: exceeds 15 MB.`);
          continue;
        }
        // Decode enough of the file to inspect its actual pixel dimensions.
        // OCR crop coordinates currently require exactly 1920 × 1080.
bitmap=await createImageBitmap(file);
        if(bitmap.width!==1920 || bitmap.height!==1080) {
          rejected.push(`${file.name}: expected 1920 × 1080, received ${bitmap.width} × ${bitmap.height}.`);
          continue;
        }
        accepted.push(file);
      }
      catch  {
        rejected.push(`${file.name}: could not read this image.`);
      }
      finally  {
        // Release decoded image resources, including rejected images.
        bitmap?.close();
      }
    }
    return  {
      accepted,rejected
    }
    ;
  }
  // Both file selection and dropping files come through this function.
async function handleImages(files) {
    if(busy || !files.length)return;
    setBusy(true);
    status(uploadStatus,'Checking screenshots…');
    status(scanStatus,'');
    try  {
      const  {
        accepted,rejected
      }
      =await validateImages(files);
      let saved=0,duplicates=0;
      const failures=[...rejected];
      for(const [index,file] of accepted.entries()) {
        status(uploadStatus,`Saving screenshot ${index+1} of ${accepted.length}…`);
        // FormData builds the multipart upload. The field name image must match
        // upload.single("image") in server.cjs. Let fetch set the multipart header.
const form=new FormData();
        form.append('image',file);
        try  {
          const response=await fetch('/api/images', {
            method:'POST',body:form
          }
          );
          const result=await response.json();
          if(!response.ok)throw new Error(result.error || 'Upload failed.');
          // The server identifies duplicate screenshots by their image hash.
result.duplicate?duplicates++:saved++;
        }
        catch(error) {
          // One failed file should not prevent the remaining files from uploading.
failures.push(`${file.name}: ${error.message}`);
        }
      }
      status(uploadStatus,[`${saved} saved · ${duplicates} already present`,...failures,...(saved||duplicates?['Ready to scan saved screenshots.']:[])].join('\n'),failures.length?'error':'success');
    }
    catch(error) {
      status(uploadStatus,error.message,'error');
    }
    finally  {
      // finally restores controls on success AND failure.
      setBusy(false);
      fileInput.value='';
    }
  }
  // Snapshot the FileList as an array before the input is cleared.
fileInput.addEventListener('change',()=>handleImages(Array.from(fileInput.files)));
  // preventDefault allows dropping here instead of opening the image in the browser.
dropZone.addEventListener('dragover',event=> {
    event.preventDefault();
    if(!busy)dropZone.classList.add('dragging');
  }
  );
  dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop',event=> {
    event.preventDefault();
    dropZone.classList.remove('dragging');
    handleImages(Array.from(event.dataTransfer.files));
  }
  );
  // Scan ALL saved screenshots through the existing endpoint, including older uploads.
scanButton.addEventListener('click',async()=> {
    if(busy)return;
    setBusy(true);
    status(scanStatus,'Scanning saved screenshots… This may take a moment.');
    try  {
      const response=await fetch('/api/scan', {
        method:'POST'
      }
      );
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'Scan failed.');
      status(scanStatus,'Scan complete. Refreshing your collection…');
      // Wait for new data before saying the collection is updated.
      // A refresh failure is caught below and shown in the scan status too.
await refreshInventory();
      status(scanStatus,'Collection updated. Close this window to browse your artifacts.','success');
    }
    catch(error) {
      status(scanStatus,error.message,'error');
    }
    finally {
      // finally restores controls on success AND failure.
      setBusy(false);
    }
  }
  );
}
)();
