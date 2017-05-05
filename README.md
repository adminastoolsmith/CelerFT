# CelerFT 

#### Description

CelerFT is a file upload tool that allows you to upload up to 5 files at a time to a web server. CelerFT uses the HTML5 File API to split 
the file into chunks and then uploads each chunk to the web server. Once the all of the chunks are uploaded a merge request is sent to
the web server to assemble the chunks into the file. On the completion of the merge request the MD5 checksum is generated for the 
uploaded file and the local file.

Web servers have a maximum file upload size and CelerFT is able to get around this by splitting the file into chunks and uploading each of the chunks to the web server. This allows CelerFT to support the uploading of Gigabit sized files.

CelerFT supports the resuming of a file upload and also supports the simultaneuos uploading of several file chunks.

The client side portion of CelerFT is written as a Javascript module and requires that the browser supports the HTML5 File API, HTML5 Web Workers, HTML5 Nested Web Workers, and the HTML5 XMLHTTPRequest Level 2. If the web browser does not support HTML5 Nested Web Workers then the subworkers.js polyfill can be used to provide this support. 

CelerFT is added to your application by adding the celerft.js module to your web page as shown in the following example:
```html
    <script src="Scripts/jquery-2.1.1.min.js"></script>
    <script src="Scripts/subworkers.js"></script>
    <script src="Scripts/celerft.js"></script>
```
Once the celerft.js module is added to the web page CelerFT is activated in the page by creating a new CelerFT object and passing an 
options object to it. The options object should contain the id of all the UI controls that CelerFT needs to interact with. This includes
the upload and resume buttons and the file control. The urls for the backend services should be passed to CelerFT in the options 
object as well.

```html
    <script type="text/javascript">
        $(document).ready(function () {

            <!-- Check browser compatability -->
            if (!(window.File && window.Blob && window.FormData)) {
                alert("Please upgrade your browser to one that supports the HTML5 file api.");
                return;
            }

            if (typeof Worker == "undefined") {
                alert("Please upgrade your browser to one that supports the HTML5 Webworker api.");
                return;
            }

            // options to send to the celerft.js
            // We are going to use JQuery to select the controls so we put a #
            // at the start of the name for the non-button controls
            var uicontrols = {

                cancelbuttonid: 'cancel_workers',
                directoryselectorid: '#select_directory',
                errorcontrolid: '#errormessage',
                fileselectorid: '#select_file',
                fieldsetid: '#file_name',
                pausebuttonid: undefined,
                progressbarid: '#progressbar',
                resumebuttonid: 'resume_upload',
                selectasnycstateid: '#select_asyncstate',
                selectparalleluploadid: '#select_parallelupload',
                tdfileid: '#file',
                tdlocalchecksumid: '#local',
                tdremotechecksumid: '#remote',
                uploadbuttonid: 'upload_file'
            }

            var urls = {

                checksumurl: '/api/CelerFTFileUpload/GetChecksum',
                chunkinfourl: '/api/CelerFTFileUpload/GetChunkInfo',
                fileinfourl: '/api/CelerFTFileUpload/GetFileInfo',
                mergeallurl: '/api/CelerFTFileUpload/MergeAll',
                uploadurl: '/api/CelerFTFileUpload/UploadChunk',
            }

            var options = {

                bytesperchunk: undefined,
                maxFiles: 5,
                maxParallelUploads: 2,
                uploadlargfileasync: false,
                uicontrols: uicontrols,
                urls: urls,
                xfilenameuploads: false
            }


            var cft = new CelerFT(options);
            cft.init();

        });
    </script>
```

##### Supported Backends

CelerFT web server backends examples are provided in Node.JS and the ASP .NET Web API.

##### Dependencies

CelerFT requires JQuery and the SparkMD5 library.
